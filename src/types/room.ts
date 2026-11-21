export interface WallSegment {
  id: string;
  start: [number, number]; // [x, z] в метри
  end: [number, number];   // [x, z] в метри
  thicknessM: number;      // дебелина в метри (напр. 0.12 или 0.25)
}

export interface FloorplanUnderlay {
  imageUrl: string;
  widthM: number;
  depthM: number;
  aspectRatio: number; // naturalWidth / naturalHeight
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
  walls: WallSegment[];
  floorplan: FloorplanUnderlay | null;
}

export interface ApartmentTemplate {
  id: string;
  name: string;
  description?: string;
  ceilingHeightM: number;
  defaultThicknessM: number;
  walls: WallSegment[];
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

/**
 * Пропорционално скалиране на подложката по 2 кликнати точки и известен реален размер в метри.
 */
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

  // Мащабираме около центъра на координатната система, за да остане чертежът подравнен
  return {
    ...floorplan,
    widthM: Math.max(0.5, nextWidth),
    depthM: Math.max(0.5, nextDepth),
    offsetX: Number((floorplan.offsetX * scaleFactor).toFixed(3)),
    offsetZ: Number((floorplan.offsetZ * scaleFactor).toFixed(3)),
  };
}

/**
 * Изчислява удълженията в началото и края на стената, за да се сглобяват ъглите плътно без срязване.
 */
export function getWallJointExtensions(
  wall: WallSegment,
  allWalls: WallSegment[]
): { startExt: number; endExt: number } {
  const eps = 0.03;
  let startExt = 0;
  let endExt = 0;

  for (const other of allWalls) {
    if (other.id === wall.id) continue;

    const otherHalfT = Math.max(0.05, other.thicknessM) / 2;

    const touchesStart =
      Math.hypot(wall.start[0] - other.start[0], wall.start[1] - other.start[1]) < eps ||
      Math.hypot(wall.start[0] - other.end[0], wall.start[1] - other.end[1]) < eps;

    if (touchesStart) {
      startExt = Math.max(startExt, otherHalfT);
    }

    const touchesEnd =
      Math.hypot(wall.end[0] - other.start[0], wall.end[1] - other.start[1]) < eps ||
      Math.hypot(wall.end[0] - other.end[0], wall.end[1] - other.end[1]) < eps;

    if (touchesEnd) {
      endExt = Math.max(endExt, otherHalfT);
    }
  }

  return { startExt, endExt };
}

/**
 * Открива затворени контури (стаи) от графа на стените за автоматично генериране на под.
 */
export function findClosedRoomPolygons(walls: WallSegment[]): [number, number][][] {
  if (walls.length < 3) return [];

  const snapKey = (p: [number, number]) =>
    `${Math.round(p[0] * 20) / 20},${Math.round(p[1] * 20) / 20}`;

  const adj = new Map<string, { point: [number, number]; neighbors: string[] }>();

  const ensureNode = (p: [number, number]): string => {
    const key = snapKey(p);
    if (!adj.has(key)) {
      adj.set(key, {
        point: [Math.round(p[0] * 20) / 20, Math.round(p[1] * 20) / 20],
        neighbors: [],
      });
    }
    return key;
  };

  for (const w of walls) {
    const k1 = ensureNode(w.start);
    const k2 = ensureNode(w.end);
    if (k1 === k2) continue;
    const n1 = adj.get(k1)!;
    const n2 = adj.get(k2)!;
    if (!n1.neighbors.includes(k2)) n1.neighbors.push(k2);
    if (!n2.neighbors.includes(k1)) n2.neighbors.push(k1);
  }

  // Търсим минимални елементарни цикли чрез обхождане по най-малък десен завой (planar face traversal)
  const visitedDirected = new Set<string>();
  const polygons: [number, number][][] = [];

  for (const [uKey, uNode] of adj.entries()) {
    for (const vKey of uNode.neighbors) {
      const edgeId = `${uKey}->${vKey}`;
      if (visitedDirected.has(edgeId)) continue;

      const cycleKeys: string[] = [uKey];
      let prev = uKey;
      let curr = vKey;
      let guard = 0;

      while (curr !== uKey && guard < 40) {
        guard++;
        visitedDirected.add(`${prev}->${curr}`);
        cycleKeys.push(curr);

        const currNode = adj.get(curr);
        const prevNode = adj.get(prev);
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
          const candNode = adj.get(cand);
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

      if (curr === uKey && cycleKeys.length >= 3) {
        visitedDirected.add(`${prev}->${curr}`);
        const polyPoints = cycleKeys
          .map((k) => adj.get(k)?.point)
          .filter((p): p is [number, number] => Boolean(p));

        // Изчисляваме ориентираната площ (shoelace), за да отсеем външния безкраен контур
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
  // 1. Прихващане към съществуващ ъгъл/точка (в радиус 20 см)
  for (const target of snapTargets) {
    if (Math.hypot(rawPoint[0] - target[0], rawPoint[1] - target[1]) <= 0.2) {
      return [Number(target[0].toFixed(3)), Number(target[1].toFixed(3))];
    }
  }

  // 2. Ако няма начална точка или е изключено ъгловото прихващане (напр. при калибрация)
  if (!anchorPoint || disableAngleSnap) {
    return [
      Number((Math.round(rawPoint[0] * 20) / 20).toFixed(2)),
      Number((Math.round(rawPoint[1] * 20) / 20).toFixed(2)),
    ];
  }

  // 3. Прихващане по ъгъл (през 45°: 0°, 45°, 90°, 135°, 180°...) и стъпка 0.05 м
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
    },
    {
      id: 'wall-init-2',
      start: [2.5, -2.0],
      end: [2.5, 2.0],
      thicknessM: defaultThicknessM,
    },
    {
      id: 'wall-init-3',
      start: [2.5, 2.0],
      end: [-2.5, 2.0],
      thicknessM: defaultThicknessM,
    },
    {
      id: 'wall-init-4',
      start: [-2.5, 2.0],
      end: [-2.5, -2.0],
      thicknessM: defaultThicknessM,
    },
  ];
}

export function createDefaultRoomConfig(): RoomConfig {
  return {
    templateId: null,
    templateName: null,
    ceilingHeightM: 2.65,
    defaultThicknessM: 0.15,
    walls: createStarterWalls(0.15),
    floorplan: null,
  };
}