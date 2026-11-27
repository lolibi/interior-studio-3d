import type { WallSegment } from '../types/room';

export interface WallSnapOptions {
  /** Половината от дълбочината на мебелта (от центъра Y-ос до гърба в локална координата -Z) */
  backOffsetM: number;
  /** Половината от ширината на мебелта (от центъра Y-ос до левия/десния край по X) */
  halfWidthM: number;
  /** Ако кухнята е Г-образна: посока на крилото ('left' или 'right') */
  lWingSide?: 'left' | 'right' | null;
  /** Дължина на Г-крилото (за по-широк обхват при ъглов снап) */
  lWingLengthM?: number;
  /** Разстояние на задействане на магнита (по подразбиране 0.34 м) */
  snapDistanceM?: number;
}

export interface WallDistanceGuide {
  start: [number, number];
  end: [number, number];
  distanceM: number;
  snapped: boolean;
}

export interface WallSnapResult {
  position: [number, number, number];
  rotationY: number;
  snapped: boolean;
  cornerSnapped: boolean;
  guides: WallDistanceGuide[];
}

interface WallFaceCandidate {
  wall: WallSegment;
  ux: number;
  uz: number;
  len: number;
  nx: number;
  nz: number;
  faceStartX: number;
  faceStartZ: number;
  perpDist: number;
  proj: number;
  targetRotY: number;
}

/**
 * Намира разстоянието от точка по посока (dirX, dirZ) до най-близката стена в стаята.
 */
function raycastToNearestWall(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  walls: WallSegment[],
  maxDistM = 8.0
): { hitX: number; hitZ: number; dist: number } | null {
  let bestDist = maxDistM;
  let bestHit: { hitX: number; hitZ: number; dist: number } | null = null;

  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;

    const ux = dx / len;
    const uz = dz / len;
    const halfT = Math.max(0.05, wall.thicknessM) / 2;

    const sides: [number, number][] = [
      [-uz, ux],
      [uz, -ux],
    ];

    for (const [nx, nz] of sides) {
      // Лъчът трябва да удря стената откъм лицевата ѝ страна
      const denom = dirX * nx + dirZ * nz;
      if (denom >= -0.05) continue;

      const faceStartX = wall.start[0] + nx * halfT;
      const faceStartZ = wall.start[1] + nz * halfT;

      const t =
        ((faceStartX - originX) * nx + (faceStartZ - originZ) * nz) / denom;
      if (t < -0.02 || t > bestDist) continue;

      const hitX = originX + dirX * t;
      const hitZ = originZ + dirZ * t;

      const proj = (hitX - faceStartX) * ux + (hitZ - faceStartZ) * uz;
      if (proj < -0.05 || proj > len + 0.05) continue;

      const clampedDist = Math.max(0, t);
      if (clampedDist < bestDist) {
        bestDist = clampedDist;
        bestHit = { hitX, hitZ, dist: clampedDist };
      }
    }
  }

  return bestHit;
}

/**
 * Прилепва мебел към най-близката стена или вътрешен ъгъл на две перпендикулярни стени,
 * и изчислява динамичните дистанции (в метри) от левия и десния край до съседните стени.
 */
export function snapFurnitureToWalls(
  rawPos: [number, number, number],
  currentRotY: number,
  walls: WallSegment[],
  options: WallSnapOptions
): WallSnapResult {
  const snapRadius = options.snapDistanceM ?? 0.34;
  const backOffset = Math.max(0.01, options.backOffsetM);
  const halfW = Math.max(0.05, options.halfWidthM);
  const wingLen = Math.max(0, options.lWingLengthM ?? 0);

  const candidates: WallFaceCandidate[] = [];

  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.1) continue;

    const ux = dx / len;
    const uz = dz / len;
    const halfT = Math.max(0.05, wall.thicknessM) / 2;

    const sides: [number, number][] = [
      [-uz, ux],
      [uz, -ux],
    ];

    for (const [nx, nz] of sides) {
      const faceStartX = wall.start[0] + nx * halfT;
      const faceStartZ = wall.start[1] + nz * halfT;

      const vx = rawPos[0] - faceStartX;
      const vz = rawPos[2] - faceStartZ;

      const proj = vx * ux + vz * uz;
      const reachTolerance = halfW + wingLen + 0.35;
      if (proj < -reachTolerance || proj > len + reachTolerance) continue;

      const perpDist = vx * nx + vz * nz;
      const targetRotY = Math.atan2(nx, nz);

      candidates.push({
        wall,
        ux,
        uz,
        len,
        nx,
        nz,
        faceStartX,
        faceStartZ,
        perpDist,
        proj,
        targetRotY,
      });
    }
  }

  // Филтрираме кандидатите за основна задна стена
  const backCandidates = candidates.filter((c) => {
    const withinSpan = c.proj >= -halfW * 0.6 && c.proj <= c.len + halfW * 0.6;
    const gapToWall = Math.abs(c.perpDist - backOffset);
    return withinSpan && gapToWall <= snapRadius && c.perpDist >= -0.18;
  });

  let finalX = rawPos[0];
  let finalZ = rawPos[2];
  let rotY = currentRotY;
  let snapped = false;
  let cornerSnapped = false;

  if (backCandidates.length > 0) {
    // Приоритет на стената с най-малък gap до гърба (и близка ориентация до текущата)
    backCandidates.sort((a, b) => {
      const gapDiff =
        Math.abs(a.perpDist - backOffset) - Math.abs(b.perpDist - backOffset);
      if (Math.abs(gapDiff) > 0.06) return gapDiff;
      const angA = Math.abs(Math.atan2(Math.sin(a.targetRotY - currentRotY), Math.cos(a.targetRotY - currentRotY)));
      const angB = Math.abs(Math.atan2(Math.sin(b.targetRotY - currentRotY), Math.cos(b.targetRotY - currentRotY)));
      return angA - angB;
    });

    const primary = backCandidates[0];
    snapped = true;
    rotY = primary.targetRotY;

    let clampedProj = primary.proj;
    if (primary.len >= halfW * 2) {
      if (clampedProj < halfW && clampedProj > halfW - 0.28) {
        clampedProj = halfW;
      } else if (
        clampedProj > primary.len - halfW &&
        clampedProj < primary.len - halfW + 0.28
      ) {
        clampedProj = primary.len - halfW;
      }
    }

    finalX =
      primary.faceStartX + primary.ux * clampedProj + primary.nx * backOffset;
    finalZ =
      primary.faceStartZ + primary.uz * clampedProj + primary.nz * backOffset;

    // Проверка за втора перпендикулярна стена (ъгъл на стаята)
    const rightX = Math.cos(rotY);
    const rightZ = -Math.sin(rotY);

    // По-силен магнит за страничната стена, ако кухнята е Г-образна от тази страна
    const leftSnapRadius = options.lWingSide === 'left' ? snapRadius + 0.14 : snapRadius;
    const rightSnapRadius = options.lWingSide === 'right' ? snapRadius + 0.14 : snapRadius;

    for (const sec of candidates) {
      if (sec.wall.id === primary.wall.id) continue;
      const dotNormals = Math.abs(primary.nx * sec.nx + primary.nz * sec.nz);
      if (dotNormals > 0.2) continue;

      const sideDot = rightX * sec.nx + rightZ * sec.nz;
      if (Math.abs(sideDot) < 0.85) continue;

      // sideDot > 0 => стената е отляво на мебела (нормалата ѝ сочи надясно)
      // sideDot < 0 => стената е отдясно на мебела (нормалата ѝ сочи наляво)
      const isLeftWall = sideDot > 0;
      const activeSideRadius = isLeftWall ? leftSnapRadius : rightSnapRadius;

      const sidePerpDist =
        (finalX - sec.faceStartX) * sec.nx + (finalZ - sec.faceStartZ) * sec.nz;

      if (Math.abs(sidePerpDist - halfW) <= activeSideRadius) {
        const correction = halfW - sidePerpDist;
        finalX += sec.nx * correction;
        finalZ += sec.nz * correction;
        cornerSnapped = true;
        break;
      }
    }
  }

  // Изчисляване на визуални размерни линии от левия и десния край на мебела към стените
  const guides: WallDistanceGuide[] = [];
  const rightX = Math.cos(rotY);
  const rightZ = -Math.sin(rotY);
  const backX = -Math.sin(rotY);
  const backZ = -Math.cos(rotY);

  // Точка на левия и десния край (близо до задната линия на мебела)
  const sampleBackShift = Math.min(backOffset * 0.5, 0.22);
  const leftEdgeX = finalX - rightX * halfW + backX * sampleBackShift;
  const leftEdgeZ = finalZ - rightZ * halfW + backZ * sampleBackShift;

  const rightEdgeX = finalX + rightX * halfW + backX * sampleBackShift;
  const rightEdgeZ = finalZ + rightZ * halfW + backZ * sampleBackShift;

  const leftHit = raycastToNearestWall(leftEdgeX, leftEdgeZ, -rightX, -rightZ, walls, 6.0);
  if (leftHit && leftHit.dist <= 5.0) {
    guides.push({
      start: [leftEdgeX, leftEdgeZ],
      end: [leftHit.hitX, leftHit.hitZ],
      distanceM: leftHit.dist,
      snapped: leftHit.dist < 0.015,
    });
  }

  const rightHit = raycastToNearestWall(rightEdgeX, rightEdgeZ, rightX, rightZ, walls, 6.0);
  if (rightHit && rightHit.dist <= 5.0) {
    guides.push({
      start: [rightEdgeX, rightEdgeZ],
      end: [rightHit.hitX, rightHit.hitZ],
      distanceM: rightHit.dist,
      snapped: rightHit.dist < 0.015,
    });
  }

  return {
    position: [
      Number(finalX.toFixed(4)),
      rawPos[1],
      Number(finalZ.toFixed(4)),
    ],
    rotationY: Number(rotY.toFixed(4)),
    snapped,
    cornerSnapped,
    guides,
  };
}