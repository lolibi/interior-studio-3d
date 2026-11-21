import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  findClosedRoomPolygons,
  getWallAngleDeg,
  getWallJointExtensions,
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
  onBreakDrawChain?: () => void;
  isCalibratingPlan?: boolean;
  calibPoints?: [number, number][];
  onCalibFloorClick?: (point: [number, number]) => void;
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

interface ClosedFloorsMeshProps {
  polygons: [number, number][][];
}

function ClosedFloorsMesh({ polygons }: ClosedFloorsMeshProps) {
  const geometries = useMemo(() => {
    return polygons.map((poly) => {
      const shape = new THREE.Shape();
      // Shape в XY се завърта по X на +90° (Math.PI / 2), за да съвпадне с [x, z] на пода
      shape.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i][0], poly[i][1]);
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    });
  }, [polygons]);

  useEffect(() => {
    return () => {
      for (const g of geometries) {
        g.dispose();
      }
    };
  }, [geometries]);

  return (
    <group>
      {geometries.map((geom, idx) => (
        <mesh
          key={`room-floor-${idx}`}
          geometry={geom}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.004, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color="#334155"
            roughness={0.9}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

interface SingleWallProps {
  wall: WallSegment;
  allWalls: WallSegment[];
  ceilingHeightM: number;
  isSelected: boolean;
  isInteractiveDisabled: boolean;
  onSelectWall?: (wallId: string | null) => void;
}

function SingleWall({
  wall,
  allWalls,
  ceilingHeightM,
  isSelected,
  isInteractiveDisabled,
  onSelectWall,
}: SingleWallProps) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const baseLength = Math.max(0.05, Math.hypot(dx, dz));
  const angleY = -Math.atan2(dz, dx);

  const { startExt, endExt } = useMemo(
    () => getWallJointExtensions(wall, allWalls),
    [wall, allWalls]
  );

  const renderLength = baseLength + startExt + endExt;
  // Изместваме центъра по оста на стената според удълженията в началото и края
  const shiftAlongWall = (endExt - startExt) / 2;
  const dirX = dx / baseLength;
  const dirZ = dz / baseLength;

  const midX = (wall.start[0] + wall.end[0]) / 2 + dirX * shiftAlongWall;
  const midZ = (wall.start[1] + wall.end[1]) / 2 + dirZ * shiftAlongWall;

  const height = Math.max(0.2, ceilingHeightM);
  const thickness = Math.max(0.05, wall.thicknessM);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (isInteractiveDisabled) return;
    e.stopPropagation();
    onSelectWall?.(wall.id);
  }

  return (
    <group position={[midX, height / 2, midZ]} rotation={[0, angleY, 0]}>
      <mesh castShadow receiveShadow onClick={handleClick}>
        <boxGeometry args={[renderLength, height, thickness]} />
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
              args={[renderLength + 0.015, height + 0.015, thickness + 0.015]}
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
  onBreakDrawChain,
  isCalibratingPlan = false,
  calibPoints = [],
  onCalibFloorClick,
}: RoomMeshProps) {
  const closedPolygons = useMemo(
    () => findClosedRoomPolygons(room.walls),
    [room.walls]
  );

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

  function resolveSnappedFromEvent(
    e: ThreeEvent<MouseEvent | PointerEvent>
  ): [number, number] {
    if (isCalibratingPlan) {
      return [
        Number(e.point.x.toFixed(3)),
        Number(e.point.z.toFixed(3)),
      ];
    }
    const anchor =
      draftPoints.length > 0 ? draftPoints[draftPoints.length - 1] : null;
    return snapDrawingPoint([e.point.x, e.point.z], anchor, snapTargets, 45);
  }

  function handleFloorMove(e: ThreeEvent<PointerEvent>) {
    if (!isDrawingWalls && !isCalibratingPlan) return;
    e.stopPropagation();
    const snapped = resolveSnappedFromEvent(e);
    onHoverPointChange?.(snapped);
  }

  function handleFloorClick(e: ThreeEvent<MouseEvent>) {
    if (isCalibratingPlan && onCalibFloorClick) {
      e.stopPropagation();
      const pt = resolveSnappedFromEvent(e);
      onCalibFloorClick(pt);
      return;
    }

    if (isDrawingWalls && onFloorDrawClick) {
      e.stopPropagation();
      const snapped = resolveSnappedFromEvent(e);
      onFloorDrawClick(snapped);
    }
  }

  function handleFloorContextMenu(e: ThreeEvent<MouseEvent>) {
    if (!isDrawingWalls) return;
    e.stopPropagation();
    onBreakDrawChain?.();
  }

  const livePreviewData = useMemo(() => {
    if (isCalibratingPlan && calibPoints.length === 1 && hoverPoint) {
      const anchor = calibPoints[0];
      const dist = Number(
        Math.hypot(hoverPoint[0] - anchor[0], hoverPoint[1] - anchor[1]).toFixed(2)
      );
      return {
        anchor,
        target: hoverPoint,
        midX: (anchor[0] + hoverPoint[0]) / 2,
        midZ: (anchor[1] + hoverPoint[1]) / 2,
        label: `Референция: ${dist} м (кликни втора точка)`,
      };
    }

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
      label: `${dist} м • ${deg}°`,
    };
  }, [isCalibratingPlan, calibPoints, isDrawingWalls, draftPoints, hoverPoint]);

  const draftLinePoints = useMemo(() => {
    const pts = draftPoints.map(
      ([x, z]) => new THREE.Vector3(x, 0.04, z)
    );
    if (isDrawingWalls && hoverPoint && pts.length > 0) {
      pts.push(new THREE.Vector3(hoverPoint[0], 0.04, hoverPoint[1]));
    }
    return pts;
  }, [draftPoints, isDrawingWalls, hoverPoint]);

  const calibLinePoints = useMemo(() => {
    const pts = calibPoints.map(
      ([x, z]) => new THREE.Vector3(x, 0.05, z)
    );
    if (isCalibratingPlan && calibPoints.length === 1 && hoverPoint) {
      pts.push(new THREE.Vector3(hoverPoint[0], 0.05, hoverPoint[1]));
    }
    return pts;
  }, [calibPoints, isCalibratingPlan, hoverPoint]);

  return (
    <group>
      {/* Невидима равнина за прихващане на кликове и движение по пода */}
      <mesh
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handleFloorMove}
        onClick={handleFloorClick}
        onContextMenu={handleFloorContextMenu}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Подложка: План от строителя */}
      {room.floorplan && <FloorplanPlane floorplan={room.floorplan} />}

      {/* Автоматични подове под затворените стаи */}
      <ClosedFloorsMesh polygons={closedPolygons} />

      {/* Всички стени с плътни ъглови сглобки */}
      {room.walls.map((wall) => (
        <SingleWall
          key={wall.id}
          wall={wall}
          allWalls={room.walls}
          ceilingHeightM={room.ceilingHeightM}
          isSelected={wall.id === selectedWallId}
          isInteractiveDisabled={isDrawingWalls || isCalibratingPlan}
          onSelectWall={onSelectWall}
        />
      ))}

      {/* Възли в краищата на съществуващи стени за лесно прихващане */}
      {isDrawingWalls &&
        snapTargets.map((pt, idx) => (
          <mesh key={`snap-node-${idx}`} position={[pt[0], 0.03, pt[1]]}>
            <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
        ))}

      {/* Линия за калибрация на плана */}
      {isCalibratingPlan && calibLinePoints.length >= 2 && (
        <Line points={calibLinePoints} color="#f59e0b" lineWidth={3} />
      )}
      {isCalibratingPlan &&
        calibPoints.map((pt, idx) => (
          <mesh key={`calib-pt-${idx}`} position={[pt[0], 0.06, pt[1]]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        ))}

      {/* Жива линия при чертане на стени */}
      {isDrawingWalls && draftLinePoints.length >= 2 && (
        <Line points={draftLinePoints} color="#38bdf8" lineWidth={3} />
      )}

      {/* Маркери на поставените точки в текущата верига */}
      {isDrawingWalls &&
        draftPoints.map((pt, idx) => (
          <mesh key={`draft-pt-${idx}`} position={[pt[0], 0.05, pt[1]]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color={idx === 0 ? '#10b981' : '#38bdf8'} />
          </mesh>
        ))}

      {/* Курсорна точка */}
      {(isDrawingWalls || isCalibratingPlan) && hoverPoint && (
        <mesh position={[hoverPoint[0], 0.05, hoverPoint[1]]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}

      {/* Жив етикет с размери */}
      {livePreviewData && (
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
            {livePreviewData.label}
          </div>
        </Html>
      )}
    </group>
  );
}