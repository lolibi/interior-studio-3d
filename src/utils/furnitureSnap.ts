import type { WallSegment } from '../types/room';

export interface WallSnapOptions {
  /** Половината от дълбочината на мебелта (от центъра Y-ос до гърба в локална координата -Z) */
  backOffsetM: number;
  /** Половината от ширината на мебелта (от центъра Y-ос до левия/десния край по X) */
  halfWidthM: number;
  /** Ако кухнята е Г-образна: посока на крилото ('left' или 'right'), за да залепне и за страничната стена */
  lWingSide?: 'left' | 'right' | null;
  /** Обща дълбочина/разстояние от центъра до външния ръб на Г-крилото */
  lWingBackOffsetM?: number;
  /** Разстояние на задействане на магнита (по подразбиране 0.32 м) */
  snapDistanceM?: number;
}

export interface WallSnapResult {
  position: [number, number, number];
  rotationY: number;
  snapped: boolean;
}

interface WallFaceCandidate {
  wall: WallSegment;
  /** Единичен вектор по дължината на стената (от start към end) */
  ux: number;
  uz: number;
  /** Дължина на стената */
  len: number;
  /** Единичен нормален вектор сочещ навън от стената към стаята */
  nx: number;
  nz: number;
  /** Начална точка на лицевата равнина на стената */
  faceStartX: number;
  faceStartZ: number;
  /** Перпендикулярно разстояние от текущия център до лицевата равнина */
  perpDist: number;
  /** Проекция по дължината на стената */
  proj: number;
  /** Y-ротация на обекта, така че локалното -Z да сочи към стената */
  targetRotY: number;
}

/**
 * Прилепва мебел към най-близката стена (или ъгъл от две перпендикулярни стени),
 * така че гърбът ѝ (-Z) да застане плътно до повърхността на стената без врязване.
 */
export function snapFurnitureToWalls(
  rawPos: [number, number, number],
  currentRotY: number,
  walls: WallSegment[],
  options: WallSnapOptions
): WallSnapResult {
  const snapRadius = options.snapDistanceM ?? 0.32;
  const backOffset = Math.max(0.01, options.backOffsetM);
  const halfW = Math.max(0.05, options.halfWidthM);

  const candidates: WallFaceCandidate[] = [];

  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.1) continue;

    const ux = dx / len;
    const uz = dz / len;
    const halfT = Math.max(0.05, wall.thicknessM) / 2;

    // Двете страни на стената: front (+normal) и back (-normal)
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
      // Проверяваме дали обектът е в обхвата на стената (с толеранс колкото ширината му)
      if (proj < -halfW || proj > len + halfW) continue;

      const perpDist = vx * nx + vz * nz;
      // Задействаме снап, когато гърбът на мебелта е близо до повърхността на стената
      const gapToWall = Math.abs(perpDist - backOffset);

      if (gapToWall <= snapRadius && perpDist >= -0.15) {
        // Локалното -Z на обекта след завъртане на rotY е (-sin(rotY), -cos(rotY)).
        // Искаме (-sin(rotY), -cos(rotY)) == (-nx, -nz) => sin(rotY) = nx, cos(rotY) = nz
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
  }

  if (candidates.length === 0) {
    return {
      position: rawPos,
      rotationY: currentRotY,
      snapped: false,
    };
  }

  // Избираме стената, чиято повърхност е най-близо до гърба на мебелта
  candidates.sort(
    (a, b) =>
      Math.abs(a.perpDist - backOffset) - Math.abs(b.perpDist - backOffset)
  );
  const primary = candidates[0];

  // Позиционираме центъра на разстояние backOffset пред повърхността на основната стена
  let clampedProj = primary.proj;
  // Ако мебелта се побира в стената, не позволяваме да излиза извън краищата ѝ при леко плъзгане
  if (primary.len >= halfW * 2) {
    if (clampedProj < halfW && clampedProj > halfW - 0.25) {
      clampedProj = halfW;
    } else if (
      clampedProj > primary.len - halfW &&
      clampedProj < primary.len - halfW + 0.25
    ) {
      clampedProj = primary.len - halfW;
    }
  }

  let finalX =
    primary.faceStartX + primary.ux * clampedProj + primary.nx * backOffset;
  let finalZ =
    primary.faceStartZ + primary.uz * clampedProj + primary.nz * backOffset;

  // Проверка за втора перпендикулярна стена (снапване в ъгъл на стая / Г-образна кухня)
  const rotY = primary.targetRotY;
  // Локалната ос +X на обекта в световни координати е (cos(rotY), -sin(rotY))
  const rightX = Math.cos(rotY);
  const rightZ = -Math.sin(rotY);

  for (const sec of candidates) {
    if (sec.wall.id === primary.wall.id) continue;
    // Проверяваме дали втората стена е приблизително перпендикулярна на основната
    const dotNormals = Math.abs(primary.nx * sec.nx + primary.nz * sec.nz);
    if (dotNormals > 0.2) continue;

    // Втората стена може да е отляво или отдясно на обекта
    const sideDot = rightX * sec.nx + rightZ * sec.nz;
    if (Math.abs(sideDot) < 0.8) continue;

    // Разстояние от центъра на обекта до повърхността на страничната стена
    const sidePerpDist =
      (finalX - sec.faceStartX) * sec.nx + (finalZ - sec.faceStartZ) * sec.nz;

    const desiredSideOffset = halfW;
    if (Math.abs(sidePerpDist - desiredSideOffset) <= snapRadius) {
      const correction = desiredSideOffset - sidePerpDist;
      finalX += sec.nx * correction;
      finalZ += sec.nz * correction;
      break;
    }
  }

  return {
    position: [
      Number(finalX.toFixed(4)),
      rawPos[1],
      Number(finalZ.toFixed(4)),
    ],
    rotationY: Number(rotY.toFixed(4)),
    snapped: true,
  };
}