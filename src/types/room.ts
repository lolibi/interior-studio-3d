export interface WallSegment {
  id: string;
  start: [number, number]; // [x, z] в метри
  end: [number, number];   // [x, z] в метри
  thicknessM: number;      // дебелина в метри (напр. 0.15 или 0.25)
}

export interface FloorplanUnderlay {
  imageUrl: string;
  widthM: number;
  depthM: number;
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

export function snapDrawingPoint(
  rawPoint: [number, number],
  anchorPoint: [number, number] | null,
  snapTargets: [number, number][],
  angleStepDeg = 45
): [number, number] {
  // 1. Прихващане към съществуващ ъгъл/точка (в радиус 20 см)
  for (const target of snapTargets) {
    if (Math.hypot(rawPoint[0] - target[0], rawPoint[1] - target[1]) <= 0.2) {
      return [Number(target[0].toFixed(3)), Number(target[1].toFixed(3))];
    }
  }

  // 2. Ако няма начална точка, прихващаме към мрежа през 0.10 м (10 см)
  if (!anchorPoint) {
    return [
      Number((Math.round(rawPoint[0] * 10) / 10).toFixed(2)),
      Number((Math.round(rawPoint[1] * 10) / 10).toFixed(2)),
    ];
  }

  // 3. Прихващане по ъгъл (напр. през 45°: 0°, 45°, 90°, 135°, 180°...) и стъпка 0.05 м (5 см)
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