import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { TransformControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { CatalogModel, TransformTool } from '../types/editor';
import {
  findClosedRoomPolygons,
  getOpeningJambPoints,
  getWallJointExtensions,
  snapDrawingPoint,
  snapOpeningToWalls,
} from '../types/room';
import type {
  FloorZone,
  RoomConfig,
  StandaloneOpening,
  WallOpening,
  WallSegment,
} from '../types/room';

interface RoomMeshProps {
  room: RoomConfig;
  models: CatalogModel[];
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStandaloneOpeningId: string | null;
  selectedFloorZoneId?: string | null;
  onSelectWall: (wallId: string | null) => void;
  onSelectOpening: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening: (openingId: string | null) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onUpdateStandaloneOpening: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  isDrawingWalls: boolean;
  draftPoints: [number, number][];
  hoverPoint: [number, number] | null;
  onHoverPointChange: (pt: [number, number] | null) => void;
  onFloorDrawClick: (pt: [number, number]) => void;
  isDrawingFloorZone?: boolean;
  zoneDraftPoints?: [number, number][];
  onFloorZoneDrawClick?: (pt: [number, number]) => void;
  isCalibratingPlan?: boolean;
  calibPoints?: [number, number][];
  onCalibFloorClick?: (pt: [number, number]) => void;
  transformTool: TransformTool;
  onDraggingChange: (dragging: boolean) => void;
}

function OpeningGlbModel({
  url,
  widthM,
  heightM,
  depthM,
}: {
  url: string;
  widthM: number;
  heightM: number;
  depthM: number;
}) {
  const { scene } = useGLTF(url);

  const normalizedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const sx = size.x > 0.0001 ? widthM / size.x : 1;
    const sy = size.y > 0.0001 ? heightM / size.y : 1;
    const sz = size.z > 0.0001 ? depthM / size.z : 1;

    clone.scale.set(sx, sy, sz);
    clone.position.set(-center.x * sx, -box.min.y * sy, -center.z * sz);

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [scene, widthM, heightM, depthM]);

  return <primitive object={normalizedScene} />;
}

function renderStandardOpeningGeometry(
  type: 'door' | 'window',
  widthM: number,
  heightM: number,
  thicknessM: number,
  swing: string | undefined,
  isSelected: boolean
) {
  const frameThickness = 0.045;
  const frameDepth = Math.max(0.06, thicknessM + 0.02);

  if (type === 'window') {
    const sashThickness = 0.03;
    const glassThickness = 0.012;
    return (
      <group position={[0, heightM / 2, 0]}>
        <mesh position={[0, heightM / 2 - frameThickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[widthM, frameThickness, frameDepth]} />
          <meshStandardMaterial color={isSelected ? '#38bdf8' : '#e2e8f0'} roughness={0.5} />
        </mesh>
        <mesh position={[0, -heightM / 2 + frameThickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[widthM, frameThickness, frameDepth + 0.03]} />
          <meshStandardMaterial color={isSelected ? '#38bdf8' : '#f1f5f9'} roughness={0.45} />
        </mesh>
        <mesh
          position={[-widthM / 2 + frameThickness / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[frameThickness, heightM - frameThickness * 2, frameDepth]} />
          <meshStandardMaterial color={isSelected ? '#38bdf8' : '#e2e8f0'} roughness={0.5} />
        </mesh>
        <mesh
          position={[widthM / 2 - frameThickness / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[frameThickness, heightM - frameThickness * 2, frameDepth]} />
          <meshStandardMaterial color={isSelected ? '#38bdf8' : '#e2e8f0'} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[sashThickness, heightM - frameThickness * 2, sashThickness]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry
            args={[
              Math.max(0.1, widthM - frameThickness * 2),
              Math.max(0.1, heightM - frameThickness * 2),
              glassThickness,
            ]}
          />
          <meshStandardMaterial
            color="#7dd3fc"
            transparent
            opacity={0.42}
            roughness={0.1}
            metalness={0.1}
          />
        </mesh>
      </group>
    );
  }

  const leafWidth = Math.max(0.3, widthM - frameThickness * 2);
  const leafHeight = Math.max(0.4, heightM - frameThickness);
  const leafThickness = 0.04;

  const isRightHinge = swing === 'right-in' || swing === 'right-out';
  const isOutward = swing === 'left-out' || swing === 'right-out';

  const hingeX = isRightHinge ? leafWidth / 2 : -leafWidth / 2;
  const leafCenterOffsetX = isRightHinge ? -leafWidth / 2 : leafWidth / 2;
  const swingAngle = (isOutward ? -1 : 1) * (isRightHinge ? -0.42 : 0.42);

  return (
    <group>
      <mesh
        position={[-widthM / 2 + frameThickness / 2, heightM / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frameThickness, heightM, frameDepth]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#94a3b8'} roughness={0.6} />
      </mesh>
      <mesh
        position={[widthM / 2 - frameThickness / 2, heightM / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frameThickness, heightM, frameDepth]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#94a3b8'} roughness={0.6} />
      </mesh>
      <mesh
        position={[0, heightM - frameThickness / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[widthM, frameThickness, frameDepth]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#94a3b8'} roughness={0.6} />
      </mesh>
      <group position={[hingeX, 0.01, 0]} rotation={[0, swingAngle, 0]}>
        <mesh position={[leafCenterOffsetX, leafHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[leafWidth, leafHeight, leafThickness]} />
          <meshStandardMaterial
            color={isSelected ? '#38bdf8' : '#cbd5e1'}
            roughness={0.55}
          />
        </mesh>
      </group>
    </group>
  );
}

function StandaloneOpeningItem({
  opening,
  models,
  walls,
  isSelected,
  isDrawingWalls,
  isDrawingFloorZone,
  isCalibratingPlan,
  transformTool,
  onSelect,
  onUpdate,
  onDraggingChange,
}: {
  opening: StandaloneOpening;
  models: CatalogModel[];
  walls: WallSegment[];
  isSelected: boolean;
  isDrawingWalls: boolean;
  isDrawingFloorZone: boolean;
  isCalibratingPlan: boolean;
  transformTool: TransformTool;
  onSelect: () => void;
  onUpdate: (patch: Partial<StandaloneOpening>) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pivotRef = useRef<any>(null);
  const rotDegRef = useRef<number>(opening.rotationDeg);
  rotDegRef.current = opening.rotationDeg;

  const customModel = useMemo(
    () => (opening.modelId ? models.find((m) => m.id === opening.modelId) ?? null : null),
    [opening.modelId, models]
  );

  const yawRad = (-opening.rotationDeg * Math.PI) / 180;
  const baseY = opening.type === 'window' ? opening.sillHeightM : 0;

  return (
    <>
      <group
        position={[opening.position[0], baseY, opening.position[1]]}
        rotation={[0, yawRad, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
          e.stopPropagation();
          onSelect();
        }}
      >
        {customModel?.glbUrl ? (
          <OpeningGlbModel
            url={customModel.glbUrl}
            widthM={opening.widthM}
            heightM={opening.heightM}
            depthM={opening.thicknessM}
          />
        ) : (
          renderStandardOpeningGeometry(
            opening.type,
            opening.widthM,
            opening.heightM,
            opening.thicknessM,
            opening.swing,
            isSelected
          )
        )}

        <mesh position={[0, opening.heightM / 2, 0]} visible={false}>
          <boxGeometry
            args={[
              Math.max(0.4, opening.widthM + 0.12),
              Math.max(0.4, opening.heightM + 0.1),
              Math.max(0.2, opening.thicknessM + 0.18),
            ]}
          />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      {isSelected &&
        !isDrawingWalls &&
        !isDrawingFloorZone &&
        !isCalibratingPlan &&
        (transformTool === 'translate' || transformTool === 'rotate') && (
          <TransformControls
            ref={pivotRef}
            mode={transformTool === 'rotate' ? 'rotate' : 'translate'}
            size={0.72}
            position={[opening.position[0], baseY + 0.25, opening.position[1]]}
            rotation={[0, yawRad, 0]}
            showY={transformTool === 'rotate' || opening.type === 'window'}
            onMouseDown={() => onDraggingChange(true)}
            onMouseUp={() => {
              onDraggingChange(false);
              const obj = pivotRef.current?.object;
              if (!obj) return;

              if (transformTool === 'rotate') {
                const deg = Number(
                  (((-obj.rotation.y * 180) / Math.PI) % 360 + 360) % 360
                );
                const snappedDeg = Math.round(deg / 15) * 15;
                onUpdate({ rotationDeg: snappedDeg });
              } else {
                const rawXZ: [number, number] = [obj.position.x, obj.position.z];
                const snapped = snapOpeningToWalls(
                  rawXZ,
                  rotDegRef.current,
                  walls,
                  0.35
                );
                const patch: Partial<StandaloneOpening> = {
                  position: snapped.position,
                  rotationDeg: snapped.rotationDeg,
                };
                if (opening.type === 'window') {
                  const nextSill = Number(
                    Math.max(0, obj.position.y - 0.25).toFixed(2)
                  );
                  patch.sillHeightM = nextSill;
                }
                onUpdate(patch);
              }
            }}
          />
        )}
    </>
  );
}

function FloorplanOverlay({
  room,
  isCalibratingPlan,
  calibPoints,
  onCalibFloorClick,
  onHoverPointChange,
}: {
  room: RoomConfig;
  isCalibratingPlan?: boolean;
  calibPoints?: [number, number][];
  onCalibFloorClick?: (pt: [number, number]) => void;
  onHoverPointChange: (pt: [number, number] | null) => void;
}) {
  const fp = room.floorplan;
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!fp || !fp.imageUrl) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(
      fp.imageUrl,
      (loadedTex) => {
        if (cancelled) {
          loadedTex.dispose();
          return;
        }
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        loadedTex.needsUpdate = true;
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
  }, [fp?.imageUrl]);

  useEffect(() => {
    return () => {
      if (texture) texture.dispose();
    };
  }, [texture]);

  if (!fp || !fp.visible || !texture) {
    return null;
  }

  const rotRad = (fp.rotationDeg * Math.PI) / 180;

  return (
    <group
      position={[fp.offsetX, 0.002, fp.offsetZ]}
      rotation={[-Math.PI / 2, 0, -rotRad]}
    >
      <mesh
        receiveShadow
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!isCalibratingPlan) return;
          e.stopPropagation();
          onHoverPointChange([
            Number(e.point.x.toFixed(3)),
            Number(e.point.z.toFixed(3)),
          ]);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!isCalibratingPlan || !onCalibFloorClick) return;
          if (e.button !== 0) return;
          e.stopPropagation();
          onCalibFloorClick([
            Number(e.point.x.toFixed(3)),
            Number(e.point.z.toFixed(3)),
          ]);
        }}
      >
        <planeGeometry args={[fp.widthM, fp.depthM]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={fp.opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {isCalibratingPlan &&
        (calibPoints ?? []).map((pt, idx) => (
          <mesh
            key={`calib-pt-${idx}`}
            position={[pt[0] - fp.offsetX, -(pt[1] - fp.offsetZ), 0.02]}
          >
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        ))}
    </group>
  );
}

function FloorZonePolygonMesh({
  points,
  color,
  roughness,
  metalness,
  opacity,
  yOffset,
  isSelected,
  onClick,
}: {
  points: [number, number][];
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  yOffset: number;
  isSelected: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], -points[0][1]);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], -points[i][1]);
    }
    shape.closePath();

    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, [points]);

  useEffect(() => {
    return () => {
      if (geometry) geometry.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      position={[0, yOffset, 0]}
      receiveShadow
      onClick={onClick}
    >
      <meshStandardMaterial
        color={isSelected ? '#38bdf8' : color}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function WallSegmentItem({
  wall,
  allWalls,
  ceilingHeightM,
  models,
  isSelected,
  selectedOpeningId,
  isDrawingWalls,
  isDrawingFloorZone,
  isCalibratingPlan,
  onSelectWall,
  onSelectOpening,
}: {
  wall: WallSegment;
  allWalls: WallSegment[];
  ceilingHeightM: number;
  models: CatalogModel[];
  isSelected: boolean;
  selectedOpeningId: string | null;
  isDrawingWalls: boolean;
  isDrawingFloorZone: boolean;
  isCalibratingPlan: boolean;
  onSelectWall: () => void;
  onSelectOpening: (openingId: string) => void;
}) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const baseLength = Math.hypot(dx, dz);

  if (baseLength < 0.01) return null;

  const angleRad = Math.atan2(dz, dx);
  const dirX = dx / baseLength;
  const dirZ = dz / baseLength;
  const thickness = Math.max(0.05, wall.thicknessM);

  const { startExt, endExt } = getWallJointExtensions(wall, allWalls);
  const effStartDist = -startExt;
  const effEndDist = baseLength + endExt;
  const length = Math.max(0.05, effEndDist - effStartDist);
  const midDist = (effStartDist + effEndDist) / 2;

  const centerX = wall.start[0] + dirX * midDist;
  const centerZ = wall.start[1] + dirZ * midDist;

  const rawOpenings = wall.openings ?? [];
  const validOpenings: WallOpening[] = rawOpenings
    .map((op) => {
      const w = Math.max(0.2, Math.min(op.widthM, length - 0.04));
      const start = Math.max(0, Math.min(op.offsetFromStartM, length - w));
      const end = start + w;
      const sill = op.type === 'window' ? Math.max(0, op.sillHeightM) : 0;
      const h = Math.max(0.2, Math.min(op.heightM, ceilingHeightM - sill));
      return {
        ...op,
        offsetFromStartM: start,
        widthM: w,
        sillHeightM: sill,
        heightM: h,
        _endM: end,
      };
    })
    .filter((op) => op._endM > op.offsetFromStartM + 0.02)
    .sort((a, b) => a.offsetFromStartM - b.offsetFromStartM);

  const wallColor = isSelected ? '#38bdf8' : '#e2e8f0';

  type SolidSpan = {
    startM: number;
    endM: number;
    bottomY: number;
    topY: number;
  };

  const spans: SolidSpan[] = [];
  let cursorM = 0;

  for (const op of validOpenings) {
    if (op.offsetFromStartM > cursorM + 0.01) {
      spans.push({
        startM: cursorM,
        endM: op.offsetFromStartM,
        bottomY: 0,
        topY: ceilingHeightM,
      });
    }

    if (op.type === 'window' && op.sillHeightM > 0.01) {
      spans.push({
        startM: op.offsetFromStartM,
        endM: op.offsetFromStartM + op.widthM,
        bottomY: 0,
        topY: op.sillHeightM,
      });
    }

    const lintelBottomY = op.sillHeightM + op.heightM;
    if (ceilingHeightM > lintelBottomY + 0.01) {
      spans.push({
        startM: op.offsetFromStartM,
        endM: op.offsetFromStartM + op.widthM,
        bottomY: lintelBottomY,
        topY: ceilingHeightM,
      });
    }

    cursorM = Math.max(cursorM, op.offsetFromStartM + op.widthM);
  }

  if (length > cursorM + 0.01) {
    spans.push({
      startM: cursorM,
      endM: length,
      bottomY: 0,
      topY: ceilingHeightM,
    });
  }

  return (
    <group
      position={[centerX, 0, centerZ]}
      rotation={[0, -angleRad, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
        e.stopPropagation();
        onSelectWall();
      }}
    >
      {spans.map((sp, idx) => {
        const segLen = sp.endM - sp.startM;
        const segHeight = sp.topY - sp.bottomY;
        const localX = (sp.startM + sp.endM) / 2 - length / 2;
        const localY = sp.bottomY + segHeight / 2;

        return (
          <mesh
            key={`${wall.id}-span-${idx}`}
            position={[localX, localY, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.75}
              metalness={0.05}
            />
          </mesh>
        );
      })}

      {validOpenings.map((op) => {
        const localX = op.offsetFromStartM + op.widthM / 2 - length / 2;
        const isOpSelected = selectedOpeningId === op.id;
        const customModel = op.modelId
          ? models.find((m) => m.id === op.modelId) ?? null
          : null;

        return (
          <group
            key={op.id}
            position={[localX, op.sillHeightM, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
              e.stopPropagation();
              onSelectOpening(op.id);
            }}
          >
            {customModel?.glbUrl ? (
              <OpeningGlbModel
                url={customModel.glbUrl}
                widthM={op.widthM}
                heightM={op.heightM}
                depthM={thickness}
              />
            ) : (
              renderStandardOpeningGeometry(
                op.type,
                op.widthM,
                op.heightM,
                thickness,
                op.swing,
                isOpSelected
              )
            )}
          </group>
        );
      })}
    </group>
  );
}

export function RoomMesh({
  room,
  models,
  selectedWallId,
  selectedOpeningId,
  selectedStandaloneOpeningId,
  selectedFloorZoneId,
  onSelectWall,
  onSelectOpening,
  onSelectStandaloneOpening,
  onSelectFloorZone,
  onUpdateStandaloneOpening,
  isDrawingWalls,
  draftPoints,
  hoverPoint,
  onHoverPointChange,
  onFloorDrawClick,
  isDrawingFloorZone = false,
  zoneDraftPoints = [],
  onFloorZoneDrawClick,
  isCalibratingPlan = false,
  calibPoints = [],
  onCalibFloorClick,
  transformTool,
  onDraggingChange,
}: RoomMeshProps) {
  const autoPolygons = useMemo(
    () => findClosedRoomPolygons(room.walls),
    [room.walls]
  );

  const floorZones: FloorZone[] = room.floorZones ?? [];

  const snapTargets = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    for (const w of room.walls) {
      pts.push(w.start, w.end);
    }
    for (const op of room.openings ?? []) {
      const [left, right] = getOpeningJambPoints(op);
      pts.push(left, right);
    }
    return pts;
  }, [room.walls, room.openings]);

  const activeDraftPts = isDrawingFloorZone ? zoneDraftPoints : draftPoints;
  const anchorPoint =
    activeDraftPts.length > 0 ? activeDraftPts[activeDraftPts.length - 1] : null;

  const snappedHover = useMemo<[number, number] | null>(() => {
    if ((!isDrawingWalls && !isDrawingFloorZone) || !hoverPoint) return null;
    if (activeDraftPts.length >= 3) {
      const first = activeDraftPts[0];
      if (Math.hypot(hoverPoint[0] - first[0], hoverPoint[1] - first[1]) <= 0.25) {
        return [first[0], first[1]];
      }
    }
    return snapDrawingPoint(hoverPoint, anchorPoint, snapTargets, 45, false);
  }, [
    isDrawingWalls,
    isDrawingFloorZone,
    hoverPoint,
    activeDraftPts,
    anchorPoint,
    snapTargets,
  ]);

  const isAnyDrawMode = isDrawingWalls || isDrawingFloorZone;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.005, 0]}
        receiveShadow
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!isAnyDrawMode && !isCalibratingPlan) return;
          e.stopPropagation();
          onHoverPointChange([
            Number(e.point.x.toFixed(3)),
            Number(e.point.z.toFixed(3)),
          ]);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.button !== 0) return;

          if (isCalibratingPlan && onCalibFloorClick) {
            e.stopPropagation();
            onCalibFloorClick([
              Number(e.point.x.toFixed(3)),
              Number(e.point.z.toFixed(3)),
            ]);
            return;
          }

          if (!isAnyDrawMode) return;
          e.stopPropagation();

          const raw: [number, number] = [
            Number(e.point.x.toFixed(3)),
            Number(e.point.z.toFixed(3)),
          ];

          if (activeDraftPts.length >= 3) {
            const first = activeDraftPts[0];
            if (Math.hypot(raw[0] - first[0], raw[1] - first[1]) <= 0.25) {
              if (isDrawingFloorZone && onFloorZoneDrawClick) {
                onFloorZoneDrawClick([first[0], first[1]]);
              } else {
                onFloorDrawClick([first[0], first[1]]);
              }
              return;
            }
          }

          const snapped = snapDrawingPoint(raw, anchorPoint, snapTargets, 45, false);
          if (isDrawingFloorZone && onFloorZoneDrawClick) {
            onFloorZoneDrawClick(snapped);
          } else {
            onFloorDrawClick(snapped);
          }
        }}
      >
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#161d2b" roughness={0.95} metalness={0.02} />
      </mesh>

      <FloorplanOverlay
        room={room}
        isCalibratingPlan={isCalibratingPlan}
        calibPoints={calibPoints}
        onCalibFloorClick={onCalibFloorClick}
        onHoverPointChange={onHoverPointChange}
      />

      {/* 1. Автоматично засечени затворени помещения */}
      {autoPolygons.map((poly, idx) => (
        <FloorZonePolygonMesh
          key={`auto-floor-${idx}`}
          points={poly}
          color="#cbd5e1"
          roughness={0.7}
          metalness={0.05}
          opacity={0.42}
          yOffset={0.004}
          isSelected={false}
          onClick={(e) => {
            if (isAnyDrawMode || isCalibratingPlan) return;
            e.stopPropagation();
            onSelectWall(null);
            onSelectStandaloneOpening(null);
            onSelectFloorZone?.(null);
          }}
        />
      ))}

      {/* 2. Отделяеми / ръчни подови зони (работят и при преходни стаи) */}
      {floorZones.map((zone, idx) => (
        <FloorZonePolygonMesh
          key={zone.id}
          points={zone.points}
          color={zone.color || '#b08968'}
          roughness={zone.roughness ?? 0.55}
          metalness={zone.metalness ?? 0.05}
          opacity={0.95}
          yOffset={0.008 + idx * 0.001}
          isSelected={selectedFloorZoneId === zone.id}
          onClick={(e) => {
            if (isAnyDrawMode || isCalibratingPlan) return;
            e.stopPropagation();
            onSelectFloorZone?.(zone.id);
            onSelectWall(null);
            onSelectStandaloneOpening(null);
          }}
        />
      ))}

      {/* Стени и вградени отвори */}
      {room.walls.map((wall) => (
        <WallSegmentItem
          key={wall.id}
          wall={wall}
          allWalls={room.walls}
          ceilingHeightM={room.ceilingHeightM}
          models={models}
          isSelected={selectedWallId === wall.id}
          selectedOpeningId={selectedOpeningId}
          isDrawingWalls={isDrawingWalls}
          isDrawingFloorZone={isDrawingFloorZone}
          isCalibratingPlan={isCalibratingPlan}
          onSelectWall={() => onSelectWall(wall.id)}
          onSelectOpening={(opId) => onSelectOpening(wall.id, opId)}
        />
      ))}

      {/* Самостоятелни врати и прозорци на плана */}
      {(room.openings ?? []).map((op) => (
        <StandaloneOpeningItem
          key={op.id}
          opening={op}
          models={models}
          walls={room.walls}
          isSelected={selectedStandaloneOpeningId === op.id}
          isDrawingWalls={isDrawingWalls}
          isDrawingFloorZone={isDrawingFloorZone}
          isCalibratingPlan={isCalibratingPlan}
          transformTool={transformTool}
          onSelect={() => onSelectStandaloneOpening(op.id)}
          onUpdate={(patch) => onUpdateStandaloneOpening(op.id, patch)}
          onDraggingChange={onDraggingChange}
        />
      ))}

      {/* Визуализация при чертане на стени или отделна подова зона */}
      {isAnyDrawMode &&
        activeDraftPts.map((pt, idx) => (
          <mesh key={`draft-pt-${idx}`} position={[pt[0], 0.04, pt[1]]}>
            <sphereGeometry args={[idx === 0 ? 0.085 : 0.065, 16, 16]} />
            <meshBasicMaterial
              color={
                isDrawingFloorZone
                  ? '#f59e0b'
                  : idx === 0
                    ? '#22c55e'
                    : '#38bdf8'
              }
            />
          </mesh>
        ))}

      {isAnyDrawMode &&
        activeDraftPts.map((pt, idx) => {
          if (idx === activeDraftPts.length - 1) return null;
          const next = activeDraftPts[idx + 1];
          const segDx = next[0] - pt[0];
          const segDz = next[1] - pt[1];
          const segLen = Math.hypot(segDx, segDz);
          if (segLen < 0.01) return null;
          const segAngle = Math.atan2(segDz, segDx);
          return (
            <mesh
              key={`draft-seg-${idx}`}
              position={[(pt[0] + next[0]) / 2, 0.03, (pt[1] + next[1]) / 2]}
              rotation={[0, -segAngle, 0]}
            >
              <boxGeometry
                args={[
                  segLen,
                  isDrawingFloorZone ? 0.015 : 0.05,
                  isDrawingFloorZone ? 0.05 : room.defaultThicknessM,
                ]}
              />
              <meshBasicMaterial
                color={isDrawingFloorZone ? '#f59e0b' : '#38bdf8'}
                transparent
                opacity={0.75}
              />
            </mesh>
          );
        })}

      {isAnyDrawMode && anchorPoint && snappedHover && (() => {
        const segDx = snappedHover[0] - anchorPoint[0];
        const segDz = snappedHover[1] - anchorPoint[1];
        const segLen = Math.hypot(segDx, segDz);
        if (segLen < 0.01) return null;
        const segAngle = Math.atan2(segDz, segDx);
        return (
          <group>
            <mesh
              position={[
                (anchorPoint[0] + snappedHover[0]) / 2,
                0.03,
                (anchorPoint[1] + snappedHover[1]) / 2,
              ]}
              rotation={[0, -segAngle, 0]}
            >
              <boxGeometry
                args={[
                  segLen,
                  isDrawingFloorZone ? 0.015 : 0.05,
                  isDrawingFloorZone ? 0.05 : room.defaultThicknessM,
                ]}
              />
              <meshBasicMaterial
                color={isDrawingFloorZone ? '#fbbf24' : '#7dd3fc'}
                transparent
                opacity={0.45}
              />
            </mesh>
            <mesh position={[snappedHover[0], 0.04, snappedHover[1]]}>
              <sphereGeometry args={[0.06, 14, 14]} />
              <meshBasicMaterial color={isDrawingFloorZone ? '#fbbf24' : '#38bdf8'} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}