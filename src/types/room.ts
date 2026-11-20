export interface WallSegment {
  id: string;
  start: [number, number]; // [x, z] в метри
  end: [number, number];   // [x, z] в метри
  heightM: number;
  thicknessM: number;
}

export interface ApartmentTemplate {
  id: string;
  name: string;
  description?: string;
  walls: WallSegment[];
  updatedAt?: string;
}

export interface RoomConfig {
  templateId?: string | null;
  templateName?: string | null;
  defaultHeightM: number;
  defaultThicknessM: number;
  walls: WallSegment[];
}

export function getWallLengthM(wall: WallSegment): number {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  return Number(Math.hypot(dx, dz).toFixed(3));
}

/**
 * Ъгъл на стената в градуси в хоризонталната XZ равнина:
 * 0° = по +X, 90° = по +Z, 180°/-180° = по -X, -90° = по -Z
 */
export function getWallAngleDeg(wall: WallSegment): number {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const deg = (Math.atan2(dz, dx) * 180) / Math.PI;
  return Number(deg.toFixed(1));
}

/**
 * Връща обновен WallSegment с нова дължина (в метри) и/или нов ъгъл (в градуси),
 * запазвайки началната точка wall.start.
 */
export function updateWallGeometry(
  wall: WallSegment,
  nextLengthM: number,
  nextAngleDeg: number
): WallSegment {
  const safeLen = Math.max(0.1, Math.min(50, nextLengthM));
  const rad = (nextAngleDeg * Math.PI) / 180;
  const endX = Number((wall.start[0] + Math.cos(rad) * safeLen).toFixed(3));
  const endZ = Number((wall.start[1] + Math.sin(rad) * safeLen).toFixed(3));

  return {
    ...wall,
    end: [endX, endZ],
  };
}

export function createStarterWalls(
  heightM = 2.65,
  thicknessM = 0.15
): WallSegment[] {
  const pts: [number, number][] = [
    [-2.5, -2.0],
    [2.5, -2.0],
    [2.5, 2.0],
    [-2.5, 2.0],
  ];

  return pts.map((p, i) => ({
    id: `wall-init-${i + 1}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    heightM,
    thicknessM,
  }));
}

export function createDefaultRoomConfig(): RoomConfig {
  const defaultHeightM = 2.65;
  const defaultThicknessM = 0.15;
  return {
    templateId: null,
    templateName: null,
    defaultHeightM,
    defaultThicknessM,
    walls: createStarterWalls(defaultHeightM, defaultThicknessM),
  };
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = createDefaultRoomConfig();