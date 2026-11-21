import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html, Line, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { CatalogModel } from '../types/editor';
import {
  findClosedRoomPolygons,
  getWallAngleDeg,
  getWallJointExtensions,
  getWallLengthM,
  snapDrawingPoint,
} from '../types/room';
import type {
  FloorplanUnderlay,
  RoomConfig,
  WallOpening,
  WallSegment,
} from '../types/room';
import { cloneAndStretchGlbByVertices } from '../utils/smartScaleGlb';

interface RoomMeshProps {
  room: RoomConfig;
  models?: CatalogModel[];
  selectedWallId?: string | null;
  selectedOpeningId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onSelectOpening?: (wallId: string, openingId: string) => void;
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

interface GlbOpeningAssetProps {
  glbUrl: string;
  opening: WallOpening;
  wallThicknessM: number;
}

function GlbOpeningAsset({
  glbUrl,
  opening,
  wallThicknessM,
}: GlbOpeningAssetProps) {
  const gltf = useGLTF(glbUrl);

  const preparedScene = useMemo(() => {
    if (opening.type === 'window') {
      // Интелигентно разтягане по вертекси — касата и профилът остават недеформирани
      return cloneAndStretchGlbByVertices(gltf.scene, {
        targetWidthM: opening.widthM,
        targetHeightM: opening.heightM,
        targetDepthM: wallThicknessM,
        frameMarginM: 0.07,
      });
    }

    // За врати: пропорционално пасване по габаритен размер
    const cloned = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const sx = size.x > 0.01 ? opening.widthM / size.x : 1;
    const sy = size.y > 0.01 ? opening.heightM / size.y : 1;
    const sz = size.z > 0.01 ? wallThicknessM / size.z : 1;

    cloned.scale.set(sx, sy, sz);
    cloned.position.set(
      -center.x * sx,
      -box.min.y * sy,
      -center.z * sz
    );
    return cloned;
  }, [gltf.scene, opening.type, opening.widthM, opening.heightM, wallThicknessM]);

  return (
    <group position={[0, -opening.heightM / 2, 0]}>
      <primitive object={preparedScene} />
    </group>
  );
}

interface OpeningFixtureProps {
  opening: WallOpening;
  wallThicknessM: number;
  models: CatalogModel[];
  isSelected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function OpeningFixture({
  opening,
  wallThicknessM,
  models,
  isSelected,
  onClick,
}: OpeningFixtureProps) {
  const assignedModel = useMemo(
    () =>
      opening.modelId
        ? models.find((m) => m.id === opening.modelId && Boolean(m.glbUrl)) ?? null
        : null,
    [opening.modelId, models]
  );

  const w = opening.widthM;
  const h = opening.heightM;
  const d = wallThicknessM;
  const frameT = 0.055;
  const frameColor = isSelected ? '#38bdf8' : opening.type === 'door' ? '#92400e' : '#f8fafc';

  if (assignedModel?.glbUrl) {
    return (
      <group onClick={onClick}>
        <Suspense fallback={null}>
          <GlbOpeningAsset
            glbUrl={assignedModel.glbUrl}
            opening={opening}
            wallThicknessM={d}
          />
        </Suspense>
        {isSelected && (
          <mesh>
            <boxGeometry args={[w + 0.02, h + 0.02, d + 0.03]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    );
  }

  if (opening.type === 'door') {
    const swing = opening.swing ?? 'left-in';
    const isRight = swing.startsWith('right');
    const isOut = swing.endsWith('out');
    const leafW = Math.max(0.2, w - frameT * 2);
    const leafH = Math.max(0.5, h - frameT);
    const hingeX = isRight ? leafW / 2 : -leafW / 2;
    const hingeZ = isOut ? d / 2 : -d / 2;
    const openAngle =
      (isRight ? -1 : 1) * (isOut ? -0.55 : 0.55);

    return (
      <group onClick={onClick}>
        {/* Лява каса */}
        <mesh position={[-w / 2 + frameT / 2, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[frameT, h, d + 0.015]} />
          <meshStandardMaterial color={frameColor} roughness={0.6} />
        </mesh>
        {/* Дясна каса */}
        <mesh position={[w / 2 - frameT / 2, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[frameT, h, d + 0.015]} />
          <meshStandardMaterial color={frameColor} roughness={0.6} />
        </mesh>
        {/* Горна каса */}
        <mesh position={[0, h / 2 - frameT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, frameT, d + 0.015]} />
          <meshStandardMaterial color={frameColor} roughness={0.6} />
        </mesh>

        {/* Крило на вратата (леко отворено в 3D за яснота) */}
        <group position={[hingeX, -frameT / 2, hingeZ]} rotation={[0, openAngle, 0]}>
          <mesh
            position={[isRight ? -leafW / 2 : leafW / 2, 0, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[leafW, leafH, 0.04]} />
            <meshStandardMaterial
              color={isSelected ? '#7dd3fc' : '#d97706'}
              roughness={0.55}
            />
          </mesh>
        </group>
      </group>
    );
  }

  // Прозорец (вграден 3D стъклопакет с рамка)
  return (
    <group onClick={onClick}>
      {/* Ляв профил */}
      <mesh position={[-w / 2 + frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      {/* Десен профил */}
      <mesh position={[w / 2 - frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      {/* Горен профил */}
      <mesh position={[0, h / 2 - frameT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, frameT, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      {/* Долен профил / перваз */}
      <mesh position={[0, -h / 2 + frameT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.03, frameT, d + 0.04]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      {/* Стъклопакет */}
      <mesh>
        <boxGeometry args={[Math.max(0.1, w - frameT * 2), Math.max(0.1, h - frameT * 2), 0.025]} />
        <meshStandardMaterial
          color="#38bdf8"
          transparent
          opacity={0.32}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

interface WallSolidBox {
  key: string;
  centerX: number; // локално спрямо центъра на стената [-baseLength/2 .. +baseLength/2]
  centerY: number; // спрямо пода [0 .. ceilingHeightM]
  width: number;
  height: number;
}

function buildWallSolidBoxes(
  baseLength: number,
  startExt: number,
  endExt: number,
  ceilingHeightM: number,
  openings: WallOpening[]
): WallSolidBox[] {
  const minX = -baseLength / 2 - startExt;
  const maxX = baseLength / 2 + endExt;

  if (!openings || openings.length === 0) {
    return [
      {
        key: 'solid-full',
        centerX: (minX + maxX) / 2,
        centerY: ceilingHeightM / 2,
        width: maxX - minX,
        height: ceilingHeightM,
      },
    ];
  }

  // Нормализираме и сортираме отворите по оста на стената
  const normalized = openings
    .map((op) => {
      const clampedStart = Math.max(
        0.05,
        Math.min(baseLength - 0.15, op.offsetFromStartM)
      );
      const clampedEnd = Math.min(
        baseLength - 0.05,
        clampedStart + Math.max(0.2, op.widthM)
      );
      const sill = op.type === 'door' ? 0 : Math.max(0, op.sillHeightM);
      const top = Math.min(ceilingHeightM - 0.05, sill + Math.max(0.3, op.heightM));

      return {
        op,
        localStart: -baseLength / 2 + clampedStart,
        localEnd: -baseLength / 2 + clampedEnd,
        sill,
        top,
      };
    })
    .filter((item) => item.localEnd - item.localStart > 0.05)
    .sort((a, b) => a.localStart - b.localStart);

  const boxes: WallSolidBox[] = [];
  let cursorX = minX;

  normalized.forEach((item, idx) => {
    // 1. Плътен стълб преди отвора
    if (item.localStart > cursorX + 0.01) {
      const w = item.localStart - cursorX;
      boxes.push({
        key: `pier-${idx}`,
        centerX: cursorX + w / 2,
        centerY: ceilingHeightM / 2,
        width: w,
        height: ceilingHeightM,
      });
    }

    const opWidth = item.localEnd - item.localStart;
    const opCenterX = (item.localStart + item.localEnd) / 2;

    // 2. Подпрозоречен зид (ако sill > 0)
    if (item.sill > 0.01) {
      boxes.push({
        key: `sill-${item.op.id}`,
        centerX: opCenterX,
        centerY: item.sill / 2,
        width: opWidth,
        height: item.sill,
      });
    }

    // 3. Трегер над вратата/прозореца до тавана
    const lintelH = ceilingHeightM - item.top;
    if (lintelH > 0.01) {
      boxes.push({
        key: `lintel-${item.op.id}`,
        centerX: opCenterX,
        centerY: item.top + lintelH / 2,
        width: opWidth,
        height: lintelH,
      });
    }

    cursorX = Math.max(cursorX, item.localEnd);
  });

  // 4. Финален плътен стълб до края на стената
  if (maxX > cursorX + 0.01) {
    const w = maxX - cursorX;
    boxes.push({
      key: 'pier-end',
      centerX: cursorX + w / 2,
      centerY: ceilingHeightM / 2,
      width: w,
      height: ceilingHeightM,
    });
  }

  return boxes;
}

interface SingleWallProps {
  wall: WallSegment;
  allWalls: WallSegment[];
  models: CatalogModel[];
  ceilingHeightM: number;
  isSelected: boolean;
  selectedOpeningId: string | null;
  isInteractiveDisabled: boolean;
  onSelectWall?: (wallId: string | null) => void;
  onSelectOpening?: (wallId: string, openingId: string) => void;
}

function SingleWall({
  wall,
  allWalls,
  models,
  ceilingHeightM,
  isSelected,
  selectedOpeningId,
  isInteractiveDisabled,
  onSelectWall,
  onSelectOpening,
}: SingleWallProps) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const baseLength = Math.max(0.05, Math.hypot(dx, dz));
  const angleY = -Math.atan2(dz, dx);

  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  const { startExt, endExt } = useMemo(
    () => getWallJointExtensions(wall, allWalls),
    [wall, allWalls]
  );

  const height = Math.max(0.2, ceilingHeightM);
  const thickness = Math.max(0.05, wall.thicknessM);
  const openings = wall.openings ?? [];

  const solidBoxes = useMemo(
    () => buildWallSolidBoxes(baseLength, startExt, endExt, height, openings),
    [baseLength, startExt, endExt, height, openings]
  );

  function handleWallClick(e: ThreeEvent<MouseEvent>) {
    if (isInteractiveDisabled) return;
    e.stopPropagation();
    onSelectWall?.(wall.id);
  }

  const totalRenderLength = baseLength + startExt + endExt;
  const totalShiftX = (endExt - startExt) / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, angleY, 0]}>
      {/* Плътни части на стената около вратите и прозорците */}
      {solidBoxes.map((box) => (
        <mesh
          key={box.key}
          position={[box.centerX, box.centerY, 0]}
          castShadow
          receiveShadow
          onClick={handleWallClick}
        >
          <boxGeometry args={[box.width, box.height, thickness]} />
          <meshStandardMaterial
            color={isSelected ? '#38bdf8' : '#e2e8f0'}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}

      {/* Врати и прозорци в стената */}
      {openings.map((op) => {
        const clampedStart = Math.max(
          0.05,
          Math.min(baseLength - 0.15, op.offsetFromStartM)
        );
        const clampedWidth = Math.min(
          baseLength - 0.05 - clampedStart,
          Math.max(0.2, op.widthM)
        );
        const sill = op.type === 'door' ? 0 : Math.max(0, op.sillHeightM);
        const clampedHeight = Math.min(
          height - 0.05 - sill,
          Math.max(0.3, op.heightM)
        );

        const localX = -baseLength / 2 + clampedStart + clampedWidth / 2;
        const localY = sill + clampedHeight / 2;

        return (
          <group key={op.id} position={[localX, localY, 0]}>
            <OpeningFixture
              opening={{
                ...op,
                widthM: clampedWidth,
                heightM: clampedHeight,
                sillHeightM: sill,
              }}
              wallThicknessM={thickness}
              models={models}
              isSelected={selectedOpeningId === op.id}
              onClick={(e) => {
                if (isInteractiveDisabled) return;
                e.stopPropagation();
                onSelectOpening?.(wall.id, op.id);
              }}
            />
          </group>
        );
      })}

      {/* Контур и етикет при избрана стена */}
      {isSelected && (
        <>
          <mesh position={[totalShiftX, height / 2, 0]}>
            <boxGeometry
              args={[totalRenderLength + 0.015, height + 0.015, thickness + 0.015]}
            />
            <meshBasicMaterial
              color="#0284c7"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
          <Html
            position={[0, height + 0.22, 0]}
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
  models = [],
  selectedWallId = null,
  selectedOpeningId = null,
  onSelectWall,
  onSelectOpening,
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

      {/* Всички стени с плътни ъглови сглобки, врати и прозорци */}
      {room.walls.map((wall) => (
        <SingleWall
          key={wall.id}
          wall={wall}
          allWalls={room.walls}
          models={models}
          ceilingHeightM={room.ceilingHeightM}
          isSelected={wall.id === selectedWallId}
          selectedOpeningId={selectedOpeningId}
          isInteractiveDisabled={isDrawingWalls || isCalibratingPlan}
          onSelectWall={onSelectWall}
          onSelectOpening={onSelectOpening}
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