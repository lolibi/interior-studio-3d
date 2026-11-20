import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { RoomConfig, WallSegment } from '../types/room';

interface RoomMeshProps {
  room: RoomConfig;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
  onFloorDrawClick?: (point: [number, number]) => void;
}

interface ComputedWallBox {
  wall: WallSegment;
  centerX: number;
  centerZ: number;
  lengthM: number;
  angleY: number;
}

interface CornerJoint {
  key: string;
  x: number;
  z: number;
  heightM: number;
  sizeM: number;
}

const DRAW_SNAP_M = 0.25;

function snapMeter(val: number, step = DRAW_SNAP_M): number {
  return Math.round(val / step) * step;
}

function computeWallBoxes(walls: WallSegment[]): ComputedWallBox[] {
  return walls.map((wall) => {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const baseLen = Math.max(0.05, Math.hypot(dx, dz));
    const t = Math.max(0.04, wall.thicknessM);
    const lengthM = baseLen + t;
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    const angleY = -Math.atan2(dz, dx);

    return {
      wall,
      centerX,
      centerZ,
      lengthM,
      angleY,
    };
  });
}

function computeCornerJoints(walls: WallSegment[]): CornerJoint[] {
  const map = new Map<string, CornerJoint>();

  for (const wall of walls) {
    const pts: [number, number][] = [wall.start, wall.end];
    const t = Math.max(0.04, wall.thicknessM);
    const h = Math.max(0.2, wall.heightM);

    for (const [x, z] of pts) {
      const key = `${x.toFixed(3)}_${z.toFixed(3)}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { key, x, z, heightM: h, sizeM: t });
      } else {
        existing.sizeM = Math.max(existing.sizeM, t);
        existing.heightM = Math.max(existing.heightM, h);
      }
    }
  }

  return Array.from(map.values());
}

export function RoomMesh({
  room,
  selectedWallId = null,
  onSelectWall,
  isDrawingWalls = false,
  draftPoints = [],
  onFloorDrawClick,
}: RoomMeshProps) {
  const wallBoxes = useMemo(() => computeWallBoxes(room.walls), [room.walls]);
  const cornerJoints = useMemo(() => computeCornerJoints(room.walls), [room.walls]);

  const draftSegments = useMemo(() => {
    if (draftPoints.length < 2) return [];
    const segs: {
      key: string;
      centerX: number;
      centerZ: number;
      lengthM: number;
      angleY: number;
    }[] = [];

    for (let i = 0; i < draftPoints.length - 1; i++) {
      const [x1, z1] = draftPoints[i];
      const [x2, z2] = draftPoints[i + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      segs.push({
        key: `draft-seg-${i}`,
        centerX: (x1 + x2) / 2,
        centerZ: (z1 + z2) / 2,
        lengthM: len,
        angleY: -Math.atan2(dz, dx),
      });
    }

    return segs;
  }, [draftPoints]);

  // Подова равнина за приемане на кликове при чертане и изчистване на селекцията при клик на празно
  const floorPlaneGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(40, 40);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  function handleWallClick(e: ThreeEvent<MouseEvent>, wallId: string) {
    if (isDrawingWalls) return;
    e.stopPropagation();
    onSelectWall?.(wallId);
  }

  function handleFloorClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    if (isDrawingWalls && onFloorDrawClick) {
      const sx = Number(snapMeter(e.point.x).toFixed(2));
      const sz = Number(snapMeter(e.point.z).toFixed(2));
      onFloorDrawClick([sx, sz]);
      return;
    }
    onSelectWall?.(null);
  }

  return (
    <group name="architecture-walls">
      {/* Невидима/полупрозрачна подова плоча на y = 0 за кликове и чертане */}
      <mesh
        geometry={floorPlaneGeometry}
        position={[0, 0.001, 0]}
        receiveShadow
        onClick={handleFloorClick}
      >
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={isDrawingWalls ? 0.25 : 0.12}
          roughness={0.9}
          metalness={0.0}
        />
      </mesh>

      {/* Стени в метри */}
      {wallBoxes.map(({ wall, centerX, centerZ, lengthM, angleY }) => {
        const isSelected = selectedWallId === wall.id;
        const h = Math.max(0.2, wall.heightM);
        const t = Math.max(0.04, wall.thicknessM);

        return (
          <mesh
            key={wall.id}
            position={[centerX, h / 2, centerZ]}
            rotation={[0, angleY, 0]}
            castShadow
            receiveShadow
            onClick={(e) => handleWallClick(e, wall.id)}
          >
            <boxGeometry args={[lengthM, h, t]} />
            <meshStandardMaterial
              color={isSelected ? '#e0f2fe' : '#f1f5f9'}
              emissive={isSelected ? '#0284c7' : '#000000'}
              emissiveIntensity={isSelected ? 0.35 : 0}
              roughness={0.85}
              metalness={0.02}
            />
          </mesh>
        );
      })}

      {/* Съединителни възли по ъглите */}
      {cornerJoints.map((joint) => (
        <mesh
          key={joint.key}
          position={[joint.x, joint.heightM / 2, joint.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[joint.sizeM, joint.heightM, joint.sizeM]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.85} metalness={0.02} />
        </mesh>
      ))}

      {/* Визуализация на точки и линии при активно чертане на стени */}
      {isDrawingWalls &&
        draftPoints.map((pt, idx) => (
          <mesh key={`draft-pt-${idx}`} position={[pt[0], 0.05, pt[1]]}>
            <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
            <meshStandardMaterial
              color={idx === 0 ? '#22c55e' : '#38bdf8'}
              emissive={idx === 0 ? '#16a34a' : '#0284c7'}
              emissiveIntensity={0.4}
            />
          </mesh>
        ))}

      {isDrawingWalls &&
        draftSegments.map((seg) => (
          <mesh
            key={seg.key}
            position={[seg.centerX, 0.04, seg.centerZ]}
            rotation={[0, seg.angleY, 0]}
          >
            <boxGeometry args={[seg.lengthM, 0.06, 0.08]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
        ))}
    </group>
  );
}