import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line, TransformControls, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import type { CatalogModel, TransformTool } from '../types/editor';
import {
  findClosedRoomPolygons,
  getOpeningJambPoints,
  getWallAngleDeg,
  getWallJointExtensions,
  getWallLengthM,
  snapDrawingPoint,
  snapOpeningToWalls,
} from '../types/room';
import type {
  DoorSwing,
  FloorplanUnderlay,
  OpeningType,
  RoomConfig,
  StandaloneOpening,
  WallOpening,
  WallSegment,
} from '../types/room';
import { cloneAndStretchGlbByVertices } from '../utils/smartScaleGlb';

interface RoomMeshProps {
  room: RoomConfig;
  models?: CatalogModel[];
  transformTool?: TransformTool;
  selectedWallId?: string | null;
  selectedOpeningId?: string | null;
  selectedStandaloneOpeningId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onSelectOpening?: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening?: (openingId: string | null) => void;
  onUpdateStandaloneOpening?: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onDraggingChange?: (dragging: boolean) => void;
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
  type: OpeningType;
  widthM: number;
  heightM: number;
  depthM: number;
}

function GlbOpeningAsset({
  glbUrl,
  type,
  widthM,
  heightM,
  depthM,
}: GlbOpeningAssetProps) {
  const gltf = useGLTF(glbUrl);

  const preparedScene = useMemo(() => {
    if (type === 'window') {
      return cloneAndStretchGlbByVertices(gltf.scene, {
        targetWidthM: widthM,
        targetHeightM: heightM,
        targetDepthM: depthM,
        frameMarginM: 0.07,
      });
    }

    const cloned = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const sx = size.x > 0.01 ? widthM / size.x : 1;
    const sy = size.y > 0.01 ? heightM / size.y : 1;
    const sz = size.z > 0.01 ? depthM / size.z : 1;

    cloned.scale.set(sx, sy, sz);
    cloned.position.set(
      -center.x * sx,
      -box.min.y * sy,
      -center.z * sz
    );
    return cloned;
  }, [gltf.scene, type, widthM, heightM, depthM]);

  return (
    <group position={[0, -heightM / 2, 0]}>
      <primitive object={preparedScene} />
    </group>
  );
}

interface OpeningVisualProps {
  type: OpeningType;
  widthM: number;
  heightM: number;
  depthM: number;
  swing?: DoorSwing;
  modelId?: string | null;
  models: CatalogModel[];
  isSelected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function OpeningVisual({
  type,
  widthM,
  heightM,
  depthM,
  swing = 'left-in',
  modelId,
  models,
  isSelected,
  onClick,
}: OpeningVisualProps) {
  const assignedModel = useMemo(
    () =>
      modelId
        ? models.find((m) => m.id === modelId && Boolean(m.glbUrl)) ?? null
        : null,
    [modelId, models]
  );

  const w = widthM;
  const h = heightM;
  const d = depthM;
  const frameT = 0.055;
  const frameColor = isSelected ? '#38bdf8' : type === 'door' ? '#92400e' : '#f8fafc';

  if (assignedModel?.glbUrl) {
    return (
      <group onClick={onClick}>
        <Suspense fallback={null}>
          <GlbOpeningAsset
            glbUrl={assignedModel.glbUrl}
            type={type}
            widthM={w}
            heightM={h}
            depthM={d}
          />
        </Suspense>
        {isSelected && (
          <mesh>
            <boxGeometry args={[w + 0.02, h + 0.02, d + 0.03]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.85} />
          </mesh>
        )}
      </group>
    );
  }

  if (type === 'door') {
    const isRight = swing.startsWith('right');
    const isOut = swing.endsWith('out');
    const leafW = Math.max(0.2, w - frameT * 2);
    const leafH = Math.max(0.5, h - frameT);
    const hingeX = isRight ? leafW / 2 : -leafW / 2;
    const hingeZ = isOut ? d / 2 : -d / 2;
    const openAngle = (isRight ? -1 : 1) * (isOut ? -0.55 : 0.55);

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

        {/* Крило на вратата */}
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

        {isSelected && (
          <mesh>
            <boxGeometry args={[w + 0.02, h + 0.02, d + 0.03]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.85} />
          </mesh>
        )}
      </group>
    );
  }

  // Прозорец
  return (
    <group onClick={onClick}>
      <mesh position={[-w / 2 + frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      <mesh position={[w / 2 - frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      <mesh position={[0, h / 2 - frameT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, frameT, d * 0.65]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      <mesh position={[0, -h / 2 + frameT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.03, frameT, d + 0.04]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} />
      </mesh>
      <mesh>
        <boxGeometry
          args={[Math.max(0.1, w - frameT * 2), Math.max(0.1, h - frameT * 2), 0.025]}
        />
        <meshStandardMaterial
          color="#38bdf8"
          transparent
          opacity={0.35}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>

      {isSelected && (
        <mesh>
          <boxGeometry args={[w + 0.03, h + 0.03, d + 0.05]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

interface StandaloneOpeningMeshProps {
  opening: StandaloneOpening;
  walls: WallSegment[];
  ceilingHeightM: number;
  models: CatalogModel[];
  transformTool: TransformTool;
  isSelected: boolean;
  isInteractiveDisabled: boolean;
  onSelect?: (openingId: string) => void;
  onUpdate?: (openingId: string, patch: Partial<StandaloneOpening>) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

function StandaloneOpeningMesh({
  opening,
  walls,
  ceilingHeightM,
  models,
  transformTool,
  isSelected,
  isInteractiveDisabled,
  onSelect,
  onUpdate,
  onDraggingChange,
}: StandaloneOpeningMeshProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<TransformControlsImpl | null>(null);

  const sill = opening.type === 'door' ? 0 : Math.max(0, opening.sillHeightM);
  const clampedH = Math.min(
    Math.max(0.3, ceilingHeightM - sill),
    Math.max(0.3, opening.heightM)
  );
  const centerY = sill + clampedH / 2;
  const angleY = -(opening.rotationDeg * Math.PI) / 180;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(opening.position[0], centerY, opening.position[1]);
    group.rotation.set(0, angleY, 0);
    group.scale.set(1, 1, 1);
  }, [opening.position, centerY, angleY]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleDragEvent = (event: { value?: unknown }) => {
      onDraggingChange?.(Boolean(event.value));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any;
    ctrl.addEventListener('dragging-changed', handleDragEvent);
    return () => {
      ctrl.removeEventListener('dragging-changed', handleDragEvent);
      onDraggingChange?.(false);
    };
  }, [isSelected, transformTool, onDraggingChange]);

  function handleGizmoObjectChange() {
    const group = groupRef.current;
    if (!group || !onUpdate) return;

    // 1. Въртене с пивота (E)
    if (transformTool === 'rotate') {
      let deg = Number(((-group.rotation.y * 180) / Math.PI).toFixed(1));
      if (deg < 0) deg += 360;
      deg = Math.round(deg / 15) * 15;
      group.rotation.set(0, -(deg * Math.PI) / 180, 0);
      group.position.y = centerY;
      onUpdate(opening.id, { rotationDeg: deg % 360 });
      return;
    }

    // 2. Преместване с пивота (W) + автоматичен snap по оста и ъгъла на близката стена
    const rawPos: [number, number] = [group.position.x, group.position.z];
    const snapped = snapOpeningToWalls(
      rawPos,
      opening.rotationDeg,
      walls,
      0.35
    );

    // 3. Ако е прозорец и се вдига/сваля по Y, променя отстоянието от пода
    let nextSill = sill;
    if (opening.type === 'window' && Math.abs(group.position.y - centerY) > 0.02) {
      const rawSill = group.position.y - clampedH / 2;
      nextSill = Number(
        Math.max(
          0,
          Math.min(ceilingHeightM - clampedH, Math.round(rawSill * 20) / 20)
        ).toFixed(2)
      );
    }

    const nextCenterY = nextSill + clampedH / 2;
    group.position.set(snapped.position[0], nextCenterY, snapped.position[1]);
    group.rotation.set(0, -(snapped.rotationDeg * Math.PI) / 180, 0);

    onUpdate(opening.id, {
      position: snapped.position,
      rotationDeg: snapped.rotationDeg,
      ...(snapped.snappedWallThicknessM
        ? { thicknessM: snapped.snappedWallThicknessM }
        : {}),
      ...(opening.type === 'window' ? { sillHeightM: nextSill } : {}),
    });
  }

  const gizmoMode = transformTool === 'rotate' ? 'rotate' : 'translate';

  return (
    <>
      <group
        ref={groupRef}
        position={[opening.position[0], centerY, opening.position[1]]}
        rotation={[0, angleY, 0]}
      >
        <OpeningVisual
          type={opening.type}
          widthM={Math.max(0.3, opening.widthM)}
          heightM={clampedH}
          depthM={Math.max(0.06, opening.thicknessM)}
          swing={opening.swing}
          modelId={opening.modelId}
          models={models}
          isSelected={isSelected}
          onClick={(e) => {
            if (isInteractiveDisabled) return;
            e.stopPropagation();
            onSelect?.(opening.id);
          }}
        />

        {isSelected && (
          <Html
            position={[0, clampedH / 2 + 0.28, 0]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                border: '1px solid #38bdf8',
                color: '#f8fafc',
                padding: '2px 7px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {opening.type === 'door' ? 'Врата' : 'Прозорец'} • {opening.widthM}×{clampedH} м
              {opening.type === 'window' ? ` (от пода: ${sill} м)` : ''}
            </div>
          </Html>
        )}
      </group>

      {isSelected && !isInteractiveDisabled && groupRef.current && (
        <TransformControls
          ref={controlsRef}
          object={groupRef.current}
          mode={gizmoMode}
          space="world"
          showY={gizmoMode === 'rotate' || opening.type === 'window'}
          showX={gizmoMode === 'translate'}
          showZ={gizmoMode === 'translate'}
          onObjectChange={handleGizmoObjectChange}
        />
      )}
    </>
  );
}

interface WallSolidBox {
  key: string;
  centerX: number;
  centerY: number;
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
        width: Math.max(0.02, maxX - minX),
        height: ceilingHeightM,
      },
    ];
  }

  const normalized = openings
    .map((op) => {
      const clampedStart = Math.max(
        0.0,
        Math.min(baseLength - 0.1, op.offsetFromStartM)
      );
      const clampedEnd = Math.min(
        baseLength,
        clampedStart + Math.max(0.2, op.widthM)
      );
      const sill = op.type === 'door' ? 0 : Math.max(0, op.sillHeightM);
      const top = Math.min(ceilingHeightM, sill + Math.max(0.3, op.heightM));

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

    if (item.sill > 0.01) {
      boxes.push({
        key: `sill-${item.op.id}`,
        centerX: opCenterX,
        centerY: item.sill / 2,
        width: opWidth,
        height: item.sill,
      });
    }

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
  standaloneOpenings: StandaloneOpening[];
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
  standaloneOpenings,
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
  const wallRad = Math.atan2(dz, dx);
  const angleY = -wallRad;

  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  const { startExt, endExt } = useMemo(
    () => getWallJointExtensions(wall, allWalls),
    [wall, allWalls]
  );

  const height = Math.max(0.2, ceilingHeightM);
  const thickness = Math.max(0.05, wall.thicknessM);
  const embeddedOpenings = wall.openings ?? [];

  const effectiveCutoutOpenings = useMemo(() => {
    const combined: WallOpening[] = [...embeddedOpenings];
    const ux = dx / baseLength;
    const uz = dz / baseLength;

    for (const sop of standaloneOpenings) {
      const sopRad = (sop.rotationDeg * Math.PI) / 180;
      const isParallel = Math.abs(Math.cos(wallRad - sopRad)) > 0.85;
      if (!isParallel) continue;

      const vx = sop.position[0] - wall.start[0];
      const vz = sop.position[1] - wall.start[1];
      const along = vx * ux + vz * uz;
      const perp = Math.abs(vx * -uz + vz * ux);

      if (perp > (thickness + sop.thicknessM) * 0.65) continue;

      const startOffset = along - sop.widthM / 2;
      const endOffset = along + sop.widthM / 2;
      if (endOffset <= 0.02 || startOffset >= baseLength - 0.02) continue;

      combined.push({
        id: `auto-cut-${sop.id}`,
        type: sop.type,
        offsetFromStartM: Math.max(0, startOffset),
        widthM: Math.min(baseLength, endOffset) - Math.max(0, startOffset),
        heightM: sop.heightM,
        sillHeightM: sop.sillHeightM,
      });
    }

    return combined;
  }, [
    embeddedOpenings,
    standaloneOpenings,
    dx,
    dz,
    baseLength,
    wallRad,
    wall.start,
    thickness,
  ]);

  const solidBoxes = useMemo(
    () =>
      buildWallSolidBoxes(
        baseLength,
        startExt,
        endExt,
        height,
        effectiveCutoutOpenings
      ),
    [baseLength, startExt, endExt, height, effectiveCutoutOpenings]
  );

  function handleWallClick(e: ThreeEvent<MouseEvent>) {
    if (isInteractiveDisabled) return;
    e.stopPropagation();
    onSelectWall?.(wall.id);
  }

  const totalRenderLength = Math.max(0.05, baseLength + startExt + endExt);
  const totalShiftX = (endExt - startExt) / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, angleY, 0]}>
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

      {embeddedOpenings.map((op) => {
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
            <OpeningVisual
              type={op.type}
              widthM={clampedWidth}
              heightM={clampedHeight}
              depthM={thickness}
              swing={op.swing}
              modelId={op.modelId}
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

      {isSelected && (
        <>
          <mesh position={[totalShiftX, height / 2, 0]}>
            <boxGeometry
              args={[totalRenderLength + 0.008, height + 0.008, thickness + 0.008]}
            />
            <meshBasicMaterial
              color="#0284c7"
              wireframe
              transparent
              opacity={0.7}
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
  transformTool = 'translate',
  selectedWallId = null,
  selectedOpeningId = null,
  selectedStandaloneOpeningId = null,
  onSelectWall,
  onSelectOpening,
  onSelectStandaloneOpening,
  onUpdateStandaloneOpening,
  onDraggingChange,
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
  const standaloneOpenings = room.openings ?? [];

  const closedPolygons = useMemo(
    () => findClosedRoomPolygons(room.walls),
    [room.walls]
  );

  const snapTargets = useMemo(() => {
    const pts: [number, number][] = [];
    for (const w of room.walls) {
      pts.push(w.start, w.end);
    }
    for (const op of standaloneOpenings) {
      const [leftJamb, rightJamb] = getOpeningJambPoints(op);
      pts.push(leftJamb, rightJamb);
    }
    for (const p of draftPoints) {
      pts.push(p);
    }
    return pts;
  }, [room.walls, standaloneOpenings, draftPoints]);

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

      {/* Всички стени */}
      {room.walls.map((wall) => (
        <SingleWall
          key={wall.id}
          wall={wall}
          allWalls={room.walls}
          standaloneOpenings={standaloneOpenings}
          models={models}
          ceilingHeightM={room.ceilingHeightM}
          isSelected={wall.id === selectedWallId}
          selectedOpeningId={selectedOpeningId}
          isInteractiveDisabled={isDrawingWalls || isCalibratingPlan}
          onSelectWall={onSelectWall}
          onSelectOpening={onSelectOpening}
        />
      ))}

      {/* Самостоятелни врати и прозорци с 3D пивот и снап към стените */}
      {standaloneOpenings.map((op) => (
        <StandaloneOpeningMesh
          key={op.id}
          opening={op}
          walls={room.walls}
          ceilingHeightM={room.ceilingHeightM}
          models={models}
          transformTool={transformTool}
          isSelected={op.id === selectedStandaloneOpeningId}
          isInteractiveDisabled={isDrawingWalls || isCalibratingPlan}
          onSelect={(id) => onSelectStandaloneOpening?.(id)}
          onUpdate={onUpdateStandaloneOpening}
          onDraggingChange={onDraggingChange}
        />
      ))}

      {/* Възли за прихващане */}
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