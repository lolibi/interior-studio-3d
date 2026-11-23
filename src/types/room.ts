export type OpeningType = 'door' | 'window';
export type DoorSwing = 'left-in' | 'right-in' | 'left-out' | 'right-out';
export type WallSide = 'front' | 'back';

export type SurfaceTarget =
  | { kind: 'wall'; wallId: string; side: WallSide }
  | { kind: 'floor'; zoneId: string };

export interface CustomUvwSettings {
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  rotationDeg?: number;
  offsetXCm?: number;
  offsetYCm?: number;
}

export function surfaceKey(target: SurfaceTarget): string {
  return target.kind === 'wall'
    ? `wall:${target.wallId}:${target.side}`
    : `floor:${target.zoneId}`;
}

export function isSameSurface(
  a: SurfaceTarget | null | undefined,
  b: SurfaceTarget | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'wall' && b.kind === 'wall') {
    return a.wallId === b.wallId && a.side === b.side;
  }
  if (a.kind === 'floor' && b.kind === 'floor') {
    return a.zoneId === b.zoneId;
  }
  return false;
}

export function toggleSurfaceInList(
  list: SurfaceTarget[],
  target: SurfaceTarget
): SurfaceTarget[] {
  const exists = list.some((item) => isSameSurface(item, target));
  if (exists) {
    return list.filter((item) => !isSameSurface(item, target));
  }
  return [...list, target];
}

export interface SavedCamera {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
  isInterior?: boolean;
}

export interface WallOpening {
  id: string;
  type: OpeningType;
  offsetFromStartM: number;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  swing?: DoorSwing;
  frameColor?: string;
  modelId?: string | null;
}

export interface StandaloneOpening {
  id: string;
  type: OpeningType;
  position: [number, number];
  rotationDeg: number;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  thicknessM: number;
  swing?: DoorSwing;
  frameColor?: string;
  modelId?: string | null;
}

export interface FloorZone {
  id: string;
  name: string;
  points: [number, number][];
  color: string;
  roughness: number;
  metalness: number;
  textureId?: string | null;
  textureRotationDeg?: number;
  uvw?: CustomUvwSettings;
}

export interface WallSegment {
  id: string;
  start: [number, number];
  end: [number, number];
  thicknessM: number;
  openings?: WallOpening[];
  frontColor?: string;
  frontTextureId?: string | null;
  frontTileHeightM?: number | null;
  frontUvw?: CustomUvwSettings;
  backColor?: string;
  backTextureId?: string | null;
  backTileHeightM?: number | null;
  backUvw?: CustomUvwSettings;
}

export interface SelectedWallVertex {
  wallId: string;
  endKey: 'start' | 'end';
}

export interface FloorplanUnderlay {
  imageUrl: string;
  widthM: number;
  depthM: number;
  aspectRatio: number;
  offsetX: number;
  offsetZ: number;
  rotationDeg: number;
  opacity: number;
  visible: boolean;
}

export interface RoomConfig {
  templateId: string | null;
  templateName: string | null;
  ceilingHeightM: number;
  defaultThicknessM: number;
  ceilingColor?: string;
  showCeiling?: boolean;
  walls: WallSegment[];
  openings?: StandaloneOpening[];
  floorZones?: FloorZone[];
  savedCameras?: SavedCamera[];
  floorplan: FloorplanUnderlay | null;
}

export interface ApartmentTemplate {
  id: string;
  name: string;
  description?: string;
  ceilingHeightM: number;
  defaultThicknessM: number;
  walls: WallSegment[];
  openings?: StandaloneOpening[];
  floorZones?: FloorZone[];
  updatedAt?: string;
}

export function getWallLengthM(wall: WallSegment): number {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  return Number(Math.hypot(dx, dz).toFixed(3));
}

export function getWallAngleDeg(wall: WallSegment): number {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  let deg = (Math.atan2(dz, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Number(deg.toFixed(1));
}

export function straightenWallOrthogonal(
  wall: WallSegment,
  movingEnd: 'start' | 'end' = 'end'
): WallSegment {
  const len = Math.max(0.05, getWallLengthM(wall));
  const currentDeg = getWallAngleDeg(wall);
  const orthoAngles = [0, 90, 180, 270];

  let nearestDeg = 0;
  let bestDiff = Infinity;
  for (const target of orthoAngles) {
    let diff = Math.abs(currentDeg - target);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      nearestDeg = target;
    }
  }

  const rad = (nearestDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * len;
  const dz = Math.sin(rad) * len;

  if (movingEnd === 'start') {
    return {
      ...wall,
      start: [
        Number((wall.end[0] - dx).toFixed(3)),
        Number((wall.end[1] - dz).toFixed(3)),
      ],
    };
  }

  return {
    ...wall,
    end: [
      Number((wall.start[0] + dx).toFixed(3)),
      Number((wall.start[1] + dz).toFixed(3)),
    ],
  };
}

export function applyVertexMoveToWalls(
  walls: WallSegment[],
  wallId: string,
  endKey: 'start' | 'end',
  rawPoint: [number, number],
  snapTargets: [number, number][],
  options: {
    linkedJoint: boolean;
    autoStraighten: boolean;
    orthoToleranceDeg?: number;
  }
): WallSegment[] {
  const targetWall = walls.find((w) => w.id === wallId);
  if (!targetWall) return walls;

  const originPt: [number, number] =
    endKey === 'start' ? targetWall.start : targetWall.end;
  const primaryAnchorPt: [number, number] =
    endKey === 'start' ? targetWall.end : targetWall.start;

  const jointTol = 0.04;

  const connectedAnchors: [number, number][] = [primaryAnchorPt];
  if (options.linkedJoint) {
    for (const w of walls) {
      if (w.id === wallId) continue;
      if (Math.hypot(w.start[0] - originPt[0], w.start[1] - originPt[1]) <= jointTol) {
        connectedAnchors.push(w.end);
      } else if (Math.hypot(w.end[0] - originPt[0], w.end[1] - originPt[1]) <= jointTol) {
        connectedAnchors.push(w.start);
      }
    }
  }

  const filteredSnapTargets = snapTargets.filter(
    (pt) => Math.hypot(pt[0] - originPt[0], pt[1] - originPt[1]) > 0.01
  );

  let exactPointSnap: [number, number] | null = null;
  let bestPointDist = 0.16;
  for (const t of filteredSnapTargets) {
    const d = Math.hypot(rawPoint[0] - t[0], rawPoint[1] - t[1]);
    if (d <= bestPointDist) {
      bestPointDist = d;
      exactPointSnap = [Number(t[0].toFixed(3)), Number(t[1].toFixed(3))];
    }
  }

  let nextPt: [number, number];

  if (exactPointSnap) {
    nextPt = exactPointSnap;
  } else {
    let snappedX = Number((Math.round(rawPoint[0] * 20) / 20).toFixed(3));
    let snappedZ = Number((Math.round(rawPoint[1] * 20) / 20).toFixed(3));

    const tolRad = ((options.orthoToleranceDeg ?? 7) * Math.PI) / 180;
    const maxAxisAlignDist = 0.22;

    let bestDx = maxAxisAlignDist;
    for (const anchor of connectedAnchors) {
      const dx = Math.abs(rawPoint[0] - anchor[0]);
      const dz = Math.abs(rawPoint[1] - anchor[1]);
      const angleFromVertical = dz > 0.05 ? Math.atan2(dx, dz) : 0;
      const withinOrtho = options.autoStraighten && angleFromVertical <= tolRad;

      if ((withinOrtho || dx <= 0.16) && dx < bestDx) {
        bestDx = dx;
        snappedX = Number(anchor[0].toFixed(3));
      }
    }
    if (bestDx === maxAxisAlignDist) {
      for (const t of filteredSnapTargets) {
        const dx = Math.abs(rawPoint[0] - t[0]);
        if (dx <= 0.12 && dx < bestDx) {
          bestDx = dx;
          snappedX = Number(t[0].toFixed(3));
        }
      }
    }

    let bestDz = maxAxisAlignDist;
    for (const anchor of connectedAnchors) {
      const dx = Math.abs(rawPoint[0] - anchor[0]);
      const dz = Math.abs(rawPoint[1] - anchor[1]);
      const angleFromHorizontal = dx > 0.05 ? Math.atan2(dz, dx) : 0;
      const withinOrtho = options.autoStraighten && angleFromHorizontal <= tolRad;

      if ((withinOrtho || dz <= 0.16) && dz < bestDz) {
        bestDz = dz;
        snappedZ = Number(anchor[1].toFixed(3));
      }
    }
    if (bestDz === maxAxisAlignDist) {
      for (const t of filteredSnapTargets) {
        const dz = Math.abs(rawPoint[1] - t[1]);
        if (dz <= 0.12 && dz < bestDz) {
          bestDz = dz;
          snappedZ = Number(t[1].toFixed(3));
        }
      }
    }

    nextPt = [snappedX, snappedZ];
  }

  return walls.map((w) => {
    if (w.id === wallId) {
      return endKey === 'start'
        ? { ...w, start: nextPt }
        : { ...w, end: nextPt };
    }

    if (!options.linkedJoint) {
      return w;
    }

    const startMatches =
      Math.hypot(w.start[0] - originPt[0], w.start[1] - originPt[1]) <= jointTol;
    const endMatches =
      Math.hypot(w.end[0] - originPt[0], w.end[1] - originPt[1]) <= jointTol;

    if (!startMatches && !endMatches) {
      return w;
    }

    return {
      ...w,
      start: startMatches ? nextPt : w.start,
      end: endMatches ? nextPt : w.end,
    };
  });
}

export function getOpeningJambPoints(
  op: StandaloneOpening
): [[number, number], [number, number]] {
  const rad = (op.rotationDeg * Math.PI) / 180;
  const halfW = Math.max(0.1, op.widthM) / 2;
  const dx = Math.cos(rad) * halfW;
  const dz = Math.sin(rad) * halfW;

  const left: [number, number] = [
    Number((op.position[0] - dx).toFixed(3)),
    Number((op.position[1] - dz).toFixed(3)),
  ];
  const right: [number, number] = [
    Number((op.position[0] + dx).toFixed(3)),
    Number((op.position[1] + dz).toFixed(3)),
  ];
  return [left, right];
}

function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return Number(a.toFixed(1));
}

function angleDiffDeg(a: number, b: number): number {
  let diff = ((a - b + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return Math.abs(diff);
}

export function snapOpeningToWalls(
  rawPos: [number, number],
  currentRotationDeg: number,
  walls: WallSegment[],
  snapRadiusM = 0.35
): {
  position: [number, number];
  rotationDeg: number;
  snappedWallThicknessM?: number;
} {
  let bestDist = snapRadiusM;
  let bestResult: {
    position: [number, number];
    rotationDeg: number;
    snappedWallThicknessM?: number;
  } | null = null;

  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;

    const ux = dx / len;
    const uz = dz / len;
    const vx = rawPos[0] - wall.start[0];
    const vz = rawPos[1] - wall.start[1];

    const proj = vx * ux + vz * uz;
    if (proj < -0.25 || proj > len + 0.25) continue;

    const clampedProj = Math.max(0, Math.min(len, proj));
    const snappedProj = Math.round(clampedProj * 20) / 20;
    const cx = wall.start[0] + ux * snappedProj;
    const cz = wall.start[1] + uz * snappedProj;

    const perpDist = Math.hypot(rawPos[0] - cx, rawPos[1] - cz);
    if (perpDist <= bestDist) {
      bestDist = perpDist;

      const wallDeg = normalizeAngleDeg((Math.atan2(dz, dx) * 180) / Math.PI);
      const oppositeDeg = normalizeAngleDeg(wallDeg + 180);
      const currNorm = normalizeAngleDeg(currentRotationDeg);

      const alignedDeg =
        angleDiffDeg(currNorm, oppositeDeg) < angleDiffDeg(currNorm, wallDeg)
          ? oppositeDeg
          : wallDeg;

      bestResult = {
        position: [Number(cx.toFixed(3)), Number(cz.toFixed(3))],
        rotationDeg: alignedDeg,
        snappedWallThicknessM: wall.thicknessM,
      };
    }
  }

  if (bestResult) {
    return bestResult;
  }

  return {
    position: [
      Number((Math.round(rawPos[0] * 20) / 20).toFixed(2)),
      Number((Math.round(rawPos[1] * 20) / 20).toFixed(2)),
    ],
    rotationDeg: normalizeAngleDeg(currentRotationDeg),
  };
}

export function computeEndpointFromAngleAndLength(
  start: [number, number],
  lengthM: number,
  angleDeg: number
): [number, number] {
  const safeLength = Math.max(0.05, Math.min(50, lengthM));
  const rad = (angleDeg * Math.PI) / 180;
  return [
    Number((start[0] + Math.cos(rad) * safeLength).toFixed(3)),
    Number((start[1] + Math.sin(rad) * safeLength).toFixed(3)),
  ];
}

export function updateWallGeometry(
  wall: WallSegment,
  lengthM: number,
  angleDeg: number
): WallSegment {
  return {
    ...wall,
    end: computeEndpointFromAngleAndLength(wall.start, lengthM, angleDeg),
  };
}

export function calibrateFloorplanByTwoPoints(
  floorplan: FloorplanUnderlay,
  p1: [number, number],
  p2: [number, number],
  realDistanceM: number
): FloorplanUnderlay {
  const currentDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (currentDist < 0.01 || realDistanceM <= 0.05) {
    return floorplan;
  }

  const scaleFactor = realDistanceM / currentDist;
  const nextWidth = Number((floorplan.widthM * scaleFactor).toFixed(3));
  const nextDepth = Number((floorplan.depthM * scaleFactor).toFixed(3));

  return {
    ...floorplan,
    widthM: Math.max(0.5, nextWidth),
    depthM: Math.max(0.5, nextDepth),
    offsetX: Number((floorplan.offsetX * scaleFactor).toFixed(3)),
    offsetZ: Number((floorplan.offsetZ * scaleFactor).toFixed(3)),
  };
}

export function getWallJointExtensions(
  wall: WallSegment,
  allWalls: WallSegment[]
): { startExt: number; endExt: number } {
  const eps = 0.06;
  let startExt = 0;
  let endExt = 0;

  const wallIndex = allWalls.findIndex((w) => w.id === wall.id);
  const wDx = wall.end[0] - wall.start[0];
  const wDz = wall.end[1] - wall.start[1];
  const wLen = Math.hypot(wDx, wDz) || 1;
  const wUx = wDx / wLen;
  const wUz = wDz / wLen;

  for (let i = 0; i < allWalls.length; i++) {
    const other = allWalls[i];
    if (other.id === wall.id) continue;

    const oDx = other.end[0] - other.start[0];
    const oDz = other.end[1] - other.start[1];
    const oLen = Math.hypot(oDx, oDz) || 1;
    const oUx = oDx / oLen;
    const oUz = oDz / oLen;

    const cross = Math.abs(wUx * oUz - wUz * oUx);
    if (cross < 0.15) continue;

    const otherHalfT = Math.max(0.05, other.thicknessM) / 2;
    const isDominant = wallIndex < i;

    const touchesStart =
      Math.hypot(wall.start[0] - other.start[0], wall.start[1] - other.start[1]) < eps ||
      Math.hypot(wall.start[0] - other.end[0], wall.start[1] - other.end[1]) < eps;

    if (touchesStart) {
      startExt = isDominant ? otherHalfT : -otherHalfT;
    }

    const touchesEnd =
      Math.hypot(wall.end[0] - other.start[0], wall.end[1] - other.start[1]) < eps ||
      Math.hypot(wall.end[0] - other.end[0], wall.end[1] - other.end[1]) < eps;

    if (touchesEnd) {
      endExt = isDominant ? otherHalfT : -otherHalfT;
    }
  }

  return { startExt, endExt };
}

export function findClosedRoomPolygons(walls: WallSegment[]): [number, number][][] {
  if (walls.length < 3) return [];

  const clusterRadius = 0.12;
  const clusters: { id: string; point: [number, number]; neighbors: string[] }[] = [];

  const ensureCluster = (p: [number, number]): string => {
    for (const c of clusters) {
      if (Math.hypot(c.point[0] - p[0], c.point[1] - p[1]) <= clusterRadius) {
        return c.id;
      }
    }
    const id = `node-${clusters.length}`;
    clusters.push({
      id,
      point: [Number(p[0].toFixed(3)), Number(p[1].toFixed(3))],
      neighbors: [],
    });
    return id;
  };

  for (const w of walls) {
    const k1 = ensureCluster(w.start);
    const k2 = ensureCluster(w.end);
    if (k1 === k2) continue;
    const n1 = clusters.find((c) => c.id === k1)!;
    const n2 = clusters.find((c) => c.id === k2)!;
    if (!n1.neighbors.includes(k2)) n1.neighbors.push(k2);
    if (!n2.neighbors.includes(k1)) n2.neighbors.push(k1);
  }

  const byId = new Map(clusters.map((c) => [c.id, c]));
  const visitedDirected = new Set<string>();
  const polygons: [number, number][][] = [];

  for (const uNode of clusters) {
    for (const vKey of uNode.neighbors) {
      const edgeId = `${uNode.id}->${vKey}`;
      if (visitedDirected.has(edgeId)) continue;

      const cycleKeys: string[] = [uNode.id];
      let prev = uNode.id;
      let curr = vKey;
      let guard = 0;

      while (curr !== uNode.id && guard < 40) {
        guard++;
        visitedDirected.add(`${prev}->${curr}`);
        cycleKeys.push(curr);

        const currNode = byId.get(curr);
        const prevNode = byId.get(prev);
        if (!currNode || !prevNode || currNode.neighbors.length < 2) {
          break;
        }

        const inAngle = Math.atan2(
          prevNode.point[1] - currNode.point[1],
          prevNode.point[0] - currNode.point[0]
        );

        let bestNext: string | null = null;
        let bestDelta = Infinity;

        for (const cand of currNode.neighbors) {
          if (cand === prev) continue;
          const candNode = byId.get(cand);
          if (!candNode) continue;

          const outAngle = Math.atan2(
            candNode.point[1] - currNode.point[1],
            candNode.point[0] - currNode.point[0]
          );
          let delta = inAngle - outAngle;
          while (delta <= 0) delta += Math.PI * 2;
          while (delta > Math.PI * 2) delta -= Math.PI * 2;

          if (delta < bestDelta) {
            bestDelta = delta;
            bestNext = cand;
          }
        }

        if (!bestNext) break;
        prev = curr;
        curr = bestNext;
      }

      if (curr === uNode.id && cycleKeys.length >= 3) {
        visitedDirected.add(`${prev}->${curr}`);
        const polyPoints = cycleKeys
          .map((k) => byId.get(k)?.point)
          .filter((p): p is [number, number] => Boolean(p));

        let signedArea = 0;
        for (let i = 0; i < polyPoints.length; i++) {
          const a = polyPoints[i];
          const b = polyPoints[(i + 1) % polyPoints.length];
          signedArea += a[0] * b[1] - b[0] * a[1];
        }
        signedArea *= 0.5;

        if (signedArea > 0.15) {
          polygons.push(polyPoints);
        }
      }
    }
  }

  return polygons;
}

export function snapDrawingPoint(
  rawPoint: [number, number],
  anchorPoint: [number, number] | null,
  snapTargets: [number, number][],
  angleStepDeg = 45,
  disableAngleSnap = false
): [number, number] {
  for (const target of snapTargets) {
    if (Math.hypot(rawPoint[0] - target[0], rawPoint[1] - target[1]) <= 0.22) {
      return [Number(target[0].toFixed(3)), Number(target[1].toFixed(3))];
    }
  }

  if (!anchorPoint || disableAngleSnap) {
    return [
      Number((Math.round(rawPoint[0] * 20) / 20).toFixed(2)),
      Number((Math.round(rawPoint[1] * 20) / 20).toFixed(2)),
    ];
  }

  const dx = rawPoint[0] - anchorPoint[0];
  const dz = rawPoint[1] - anchorPoint[1];
  const rawDist = Math.hypot(dx, dz);
  if (rawDist < 0.02) {
    return anchorPoint;
  }

  const rawDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
  const snappedDeg = Math.round(rawDeg / angleStepDeg) * angleStepDeg;
  const snappedDist = Math.max(0.05, Math.round(rawDist * 20) / 20);

  return computeEndpointFromAngleAndLength(anchorPoint, snappedDist, snappedDeg);
}

export function createStarterWalls(defaultThicknessM = 0.15): WallSegment[] {
  return [
    {
      id: 'wall-init-1',
      start: [-2.5, -2.0],
      end: [2.5, -2.0],
      thicknessM: defaultThicknessM,
      openings: [],
    },
    {
      id: 'wall-init-2',
      start: [2.5, -2.0],
      end: [2.5, 2.0],
      thicknessM: defaultThicknessM,
      openings: [],
    },
    {
      id: 'wall-init-3',
      start: [2.5, 2.0],
      end: [-2.5, 2.0],
      thicknessM: defaultThicknessM,
      openings: [],
    },
    {
      id: 'wall-init-4',
      start: [-2.5, 2.0],
      end: [-2.5, -2.0],
      thicknessM: defaultThicknessM,
      openings: [],
    },
  ];
}

export function createDefaultRoomConfig(): RoomConfig {
  return {
    templateId: null,
    templateName: null,
    ceilingHeightM: 2.65,
    defaultThicknessM: 0.15,
    ceilingColor: '#f8fafc',
    showCeiling: false,
    walls: createStarterWalls(0.15),
    openings: [],
    floorZones: [],
    savedCameras: [],
    floorplan: null,
  };
}