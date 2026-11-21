import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  getWallAngleDeg,
  getWallLengthM,
  snapDrawingPoint,
} from '../types/room';
import type { FloorplanUnderlay, RoomConfig, WallSegment } from '../types/room';

interface RoomMeshProps {
  room: RoomConfig;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
  hoverPoint?: [number, number] | null;
  onHoverPointChange?: (pt: [number, number] | null) => void;
  onFloorDrawClick?: (point: [number, number]) => void;
}

interface FloorplanPlaneProps {
  floorplan: FloorplanUnderlay;
}

function FloorplanPlane({ floorplan }: FloorplanPlaneProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!floorplan.imageUrl) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      floorplan.imageUrl,
      (loadedTex) => {
        if (cancelled) {
          loadedTex.dispose();
          return;
        }
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        loadedTex.anisotropy = 4;
        setTexture(loadedTex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [floorplan.imageUrl]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!floorplan.visible || !texture) return null;

  const rotRad = (floorplan.rotationDeg * Math.PI) / 180;

  return (
    <mesh
      position={[floorplan.offsetX, 0.002, floorplan.offsetZ]}
      rotation={[-Math.PI / 2, 0, -rotRad]}
      receiveShadow
    >
      <planeGeometry
        args={[
          Math.max(0.5, floorplan.widthM),
          Math.max(0.5, floorplan.depthM),
        ]}
      />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={Math.min(1, Math.max(0.1, floorplan.opacity))}
        depthWrite={false}
      />
    </mesh>
  );
}

interface SingleWallProps {
  wall: WallSegment;
  ceilingHeightM: number;
  isSelected: boolean;
  isDrawingWalls: boolean;
  onSelectWall?: (wallId: string | null) => void;
}

function SingleWall({
  wall,
  ceilingHeightM,
  isSelected,
  isDrawingWalls,
  onSelectWall,
}: SingleWallProps) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.max(0.05, Math.hypot(dx, dz));
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const angleY = -Math.atan2(dz, dx);

  const height = Math.max(0.2, ceilingHeightM);
  const thickness = Math.max(0.05, wall.thicknessM);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (isDrawingWalls) return;
    e.stopPropagation();
    onSelectWall?.(wall.id);
  }

  return (
    <group position={[midX, height / 2, midZ]} rotation={[0, angleY, 0]}>
      <mesh castShadow receiveShadow onClick={handleClick}>
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : '#e2e8f0'}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {isSelected && (
        <>
          <mesh>
            <boxGeometry
              args={[length + 0.015, height + 0.015, thickness + 0.015]}
            />
            <meshBasicMaterial
              color="#0284c7"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
          <Html
            position={[0, height / 2 + 0.22, 0]}
            center
            distanceFactor={8}
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid #38bdf8',
                color: '#f8fafc',
                padding: '2px 7px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {getWallLengthM(wall)} м • {getWallAngleDeg(wall)}°
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

export function RoomMesh({
  room,
  selectedWallId = null,
  onSelectWall,
  isDrawingWalls = false,
  draftPoints = [],
  hoverPoint = null,
  onHoverPointChange,
  onFloorDrawClick,
}: RoomMeshProps) {
  const snapTargets = useMemo(() => {
    const pts: [number, number][] = [];
    for (const w of room.walls) {
      pts.push(w.start, w.end);
    }
    for (const p of draftPoints) {
      pts.push(p);
    }
    return pts;
  }, [room.walls, draftPoints]);

  function resolveSnappedFromEvent(e: ThreeEvent<MouseEvent | PointerEvent>): [number, number] {
    const anchor =
      draftPoints.length > 0 ? draftPoints[draftPoints.length - 1] : null;
    return snapDrawingPoint([e.point.x, e.point.z], anchor, snapTargets, 45);
  }

  function handleFloorMove(e: ThreeEvent<PointerEvent>) {
    if (!isDrawingWalls) return;
    e.stopPropagation();
    const snapped = resolveSnappedFromEvent(e);
    onHoverPointChange?.(snapped);
  }

  function handleFloorClick(e: ThreeEvent<MouseEvent>) {
    if (!isDrawingWalls || !onFloorDrawClick) return;
    e.stopPropagation();
    const snapped = resolveSnappedFromEvent(e);
    onFloorDrawClick(snapped);
  }

  const livePreviewData = useMemo(() => {
    if (!isDrawingWalls || draftPoints.length === 0 || !hoverPoint) {
      return null;
    }
    const anchor = draftPoints[draftPoints.length - 1];
    const dx = hoverPoint[0] - anchor[0];
    const dz = hoverPoint[1] - anchor[1];
    const dist = Number(Math.hypot(dx, dz).toFixed(2));
    let deg = (Math.atan2(dz, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    deg = Number(deg.toFixed(0));

    return {
      anchor,
      target: hoverPoint,
      midX: (anchor[0] + hoverPoint[0]) / 2,
      midZ: (anchor[1] + hoverPoint[1]) / 2,
      dist,
      deg,
    };
  }, [isDrawingWalls, draftPoints, hoverPoint]);

  const draftLinePoints = useMemo(() => {
    const pts = draftPoints.map(
      ([x, z]) => new THREE.Vector3(x, 0.03, z)
    );
    if (isDrawingWalls && hoverPoint && pts.length > 0) {
      pts.push(new THREE.Vector3(hoverPoint[0], 0.03, hoverPoint[1]));
    }
    return pts;
  }, [draftPoints, isDrawingWalls, hoverPoint]);

  return (
    <group>
      {/* Невидима равнина за прецизно прихващане на кликове и движение по пода */}
      <mesh
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handleFloorMove}
        onClick={handleFloorClick}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Подложка: План от строителя */}
      {room.floorplan && <FloorplanPlane floorplan={room.floorplan} />}

      {/* Всички стени с обща височина на апартамента */}
      {room.walls.map((wall) => (
        <SingleWall
          key={wall.id}
          wall={wall}
          ceilingHeightM={room.ceilingHeightM}
          isSelected={wall.id === selectedWallId}
          isDrawingWalls={isDrawingWalls}
          onSelectWall={onSelectWall}
        />
      ))}

      {/* Точки в краищата на стените (визуални възли при чертане) */}
      {isDrawingWalls &&
        snapTargets.map((pt, idx) => (
          <mesh key={`snap-node-${idx}`} position={[pt[0], 0.025, pt[1]]}>
            <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
        ))}

      {/* Жива линия при чертане */}
      {isDrawingWalls && draftLinePoints.length >= 2 && (
        <Line
          points={draftLinePoints}
          color="#38bdf8"
          lineWidth={3}
        />
      )}

      {/* Маркери на поставените точки в текущия чертеж */}
      {isDrawingWalls &&
        draftPoints.map((pt, idx) => (
          <mesh key={`draft-pt-${idx}`} position={[pt[0], 0.04, pt[1]]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color={idx === 0 ? '#10b981' : '#38bdf8'} />
          </mesh>
        ))}

      {/* Курсорна точка при прихващане */}
      {isDrawingWalls && hoverPoint && (
        <mesh position={[hoverPoint[0], 0.04, hoverPoint[1]]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}

      {/* Етикет с жива дължина (м) и ъгъл (°) докато местиш мишката */}
      {livePreviewData && livePreviewData.dist > 0 && (
        <Html
          position={[livePreviewData.midX, 0.35, livePreviewData.midZ]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid #f59e0b',
              color: '#fef3c7',
              padding: '3px 8px',
              borderRadius: '5px',
              fontSize: '12px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}
          >
            {livePreviewData.dist} м • {livePreviewData.deg}°
          </div>
        </Html>
      )}
    </group>
  );
}