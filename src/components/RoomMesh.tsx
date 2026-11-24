import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGLTF, TransformControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type {
  CatalogModel,
  CatalogTexture,
  TransformTool,
} from '../types/editor';
import {
  applyVertexMoveToFloorZone,
  applyVertexMoveToWalls,
  buildRoomSnapData,
  findClosedRoomPolygons,
  getWallEndCapColors,
  getWallJointExtensions,
  isSameSurface,
  snapDrawingPoint,
  snapOpeningToWalls,
  surfaceKey,
} from '../types/room';
import type {
  CustomUvwSettings,
  FloorZone,
  RoomConfig,
  SelectedFloorVertex,
  SelectedWallVertex,
  SnapSegment,
  StandaloneOpening,
  SurfaceTarget,
  WallOpening,
  WallSegment,
} from '../types/room';

interface RoomMeshProps {
  room: RoomConfig;
  models: CatalogModel[];
  textures?: CatalogTexture[];
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStandaloneOpeningId: string | null;
  selectedFloorZoneId?: string | null;
  selectedSurfaces?: SurfaceTarget[];
  draggedTextureId?: string | null;
  selectedWallVertex?: SelectedWallVertex | null;
  selectedFloorVertex?: SelectedFloorVertex | null;
  linkedVertexJoint?: boolean;
  autoStraightenVertices?: boolean;
  onSelectWall: (wallId: string | null) => void;
  onSelectSurface?: (target: SurfaceTarget, additive: boolean) => void;
  onDropTextureOnSurface?: (target: SurfaceTarget, textureId: string) => void;
  onSelectOpening: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening: (openingId: string | null) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onSelectWallVertex?: (vertex: SelectedWallVertex | null) => void;
  onSelectFloorVertex?: (vertex: SelectedFloorVertex | null) => void;
  onUpdateStandaloneOpening: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onCommitWallsFromVertex?: (nextWalls: WallSegment[]) => void;
  onCommitFloorZonesFromVertex?: (nextZones: FloorZone[]) => void;
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

const baseTextureCache = new Map<string, THREE.Texture>();
const pendingTextureLoads = new Map<string, Promise<THREE.Texture | null>>();

function loadBaseTexture(url: string): Promise<THREE.Texture | null> {
  const existing = baseTextureCache.get(url);
  if (existing) {
    return Promise.resolve(existing);
  }
  const inflight = pendingTextureLoads.get(url);
  if (inflight) {
    return inflight;
  }

  const promise = new Promise<THREE.Texture | null>((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        baseTextureCache.set(url, tex);
        pendingTextureLoads.delete(url);
        resolve(tex);
      },
      undefined,
      () => {
        pendingTextureLoads.delete(url);
        resolve(null);
      }
    );
  });

  pendingTextureLoads.set(url, promise);
  return promise;
}

function useScaledCatalogTexture(
  textureMeta: CatalogTexture | null | undefined,
  repeatX: number,
  repeatY: number,
  rotationDeg = 0,
  offsetU = 0,
  offsetV = 0
): THREE.Texture | null {
  const [baseTex, setBaseTex] = useState<THREE.Texture | null>(() =>
    textureMeta?.mapUrl ? baseTextureCache.get(textureMeta.mapUrl) ?? null : null
  );

  useEffect(() => {
    if (!textureMeta?.mapUrl) {
      setBaseTex(null);
      return;
    }
    let cancelled = false;
    loadBaseTexture(textureMeta.mapUrl).then((loaded) => {
      if (!cancelled) {
        setBaseTex(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [textureMeta?.mapUrl]);

  const clonedTex = useMemo(() => {
    if (!baseTex || !textureMeta) return null;
    const clone = baseTex.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(Math.max(0.01, repeatX), Math.max(0.01, repeatY));
    clone.offset.set(offsetU, offsetV);
    clone.center.set(0.5, 0.5);
    clone.rotation = (rotationDeg * Math.PI) / 180;
    clone.needsUpdate = true;
    return clone;
  }, [baseTex, textureMeta, repeatX, repeatY, rotationDeg, offsetU, offsetV]);

  useEffect(() => {
    return () => {
      if (clonedTex) clonedTex.dispose();
    };
  }, [clonedTex]);

  return clonedTex;
}

function resolveEffectiveTileMeters(
  textureMeta: CatalogTexture | null | undefined,
  uvw?: CustomUvwSettings
): { tileWM: number; tileHM: number; rotDeg: number; offU: number; offV: number } {
  const baseWM = textureMeta ? Math.max(0.05, textureMeta.tileWidthM) : 0.6;
  const baseHM = textureMeta ? Math.max(0.05, textureMeta.tileHeightM) : 0.6;

  const tileWM =
    uvw?.tileWidthCm && uvw.tileWidthCm > 1 ? uvw.tileWidthCm / 100 : baseWM;
  const tileHM =
    uvw?.tileHeightCm && uvw.tileHeightCm > 1 ? uvw.tileHeightCm / 100 : baseHM;
  const rotDeg = uvw?.rotationDeg ?? 0;

  const offU = uvw?.offsetXCm ? uvw.offsetXCm / 100 / tileWM : 0;
  const offV = uvw?.offsetYCm ? uvw.offsetYCm / 100 / tileHM : 0;

  return { tileWM, tileHM, rotDeg, offU, offV };
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
  frameColor: string | undefined,
  isSelected: boolean
) {
  const frameThickness = 0.045;
  const frameDepth = Math.max(0.06, thicknessM + 0.02);

  if (type === 'window') {
    const sashThickness = 0.03;
    const glassThickness = 0.012;
    const winFrameColor = isSelected ? '#38bdf8' : frameColor || '#e2e8f0';
    const sillColor = isSelected ? '#38bdf8' : frameColor || '#f1f5f9';

    return (
      <group position={[0, heightM / 2, 0]}>
        <mesh position={[0, heightM / 2 - frameThickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[widthM, frameThickness, frameDepth]} />
          <meshStandardMaterial color={winFrameColor} roughness={0.45} />
        </mesh>
        <mesh position={[0, -heightM / 2 + frameThickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[widthM, frameThickness, frameDepth + 0.03]} />
          <meshStandardMaterial color={sillColor} roughness={0.45} />
        </mesh>
        <mesh
          position={[-widthM / 2 + frameThickness / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[frameThickness, heightM - frameThickness * 2, frameDepth]} />
          <meshStandardMaterial color={winFrameColor} roughness={0.45} />
        </mesh>
        <mesh
          position={[widthM / 2 - frameThickness / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[frameThickness, heightM - frameThickness * 2, frameDepth]} />
          <meshStandardMaterial color={winFrameColor} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[sashThickness, heightM - frameThickness * 2, sashThickness]} />
          <meshStandardMaterial color={winFrameColor} roughness={0.45} />
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

  const doorJambColor = isSelected ? '#38bdf8' : frameColor || '#94a3b8';
  const doorLeafColor = isSelected ? '#38bdf8' : frameColor || '#cbd5e1';

  return (
    <group>
      <mesh
        position={[-widthM / 2 + frameThickness / 2, heightM / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frameThickness, heightM, frameDepth]} />
        <meshStandardMaterial color={doorJambColor} roughness={0.55} />
      </mesh>
      <mesh
        position={[widthM / 2 - frameThickness / 2, heightM / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frameThickness, heightM, frameDepth]} />
        <meshStandardMaterial color={doorJambColor} roughness={0.55} />
      </mesh>
      <mesh
        position={[0, heightM - frameThickness / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[widthM, frameThickness, frameDepth]} />
        <meshStandardMaterial color={doorJambColor} roughness={0.55} />
      </mesh>
      <group position={[hingeX, 0.01, 0]} rotation={[0, swingAngle, 0]}>
        <mesh position={[leafCenterOffsetX, leafHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[leafWidth, leafHeight, leafThickness]} />
          <meshStandardMaterial color={doorLeafColor} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function projectStandaloneOpeningOntoWall(
  op: StandaloneOpening,
  wallStart: [number, number],
  dirX: number,
  dirZ: number,
  effStartDist: number,
  length: number,
  thickness: number
): WallOpening | null {
  const vx = op.position[0] - wallStart[0];
  const vz = op.position[1] - wallStart[1];

  const projAlong = vx * dirX + vz * dirZ;
  const perpDist = Math.abs(-vx * dirZ + vz * dirX);

  const maxPerp = Math.max(0.35, thickness / 2 + 0.3);
  if (perpDist > maxPerp) return null;

  const localCenterM = projAlong - effStartDist;
  const halfW = Math.max(0.15, op.widthM / 2);

  const clampedStart = Math.max(0.02, localCenterM - halfW);
  const clampedEnd = Math.min(length - 0.02, localCenterM + halfW);

  if (clampedEnd - clampedStart <= 0.05) {
    return null;
  }

  return {
    id: `cut-${op.id}`,
    type: op.type,
    offsetFromStartM: clampedStart,
    widthM: clampedEnd - clampedStart,
    heightM: op.heightM,
    sillHeightM: op.type === 'window' ? op.sillHeightM : 0,
    swing: op.swing,
    frameColor: op.frameColor,
    modelId: op.modelId,
  };
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
  onLiveMove,
  onCommit,
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
  onLiveMove: (next: StandaloneOpening) => void;
  onCommit: (patch: Partial<StandaloneOpening>) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const openingGroupRef = useRef<THREE.Group | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const latestDraftRef = useRef<StandaloneOpening>(opening);
  latestDraftRef.current = opening;

  const customModel = useMemo(
    () => (opening.modelId ? models.find((m) => m.id === opening.modelId) ?? null : null),
    [opening.modelId, models]
  );

  const yawRad = (-opening.rotationDeg * Math.PI) / 180;
  const baseY = opening.type === 'window' ? opening.sillHeightM : 0;

  return (
    <>
      <group
        ref={openingGroupRef}
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
            opening.frameColor,
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
        openingGroupRef.current &&
        !isDrawingWalls &&
        !isDrawingFloorZone &&
        !isCalibratingPlan &&
        (transformTool === 'translate' || transformTool === 'rotate') && (
          <TransformControls
            ref={controlsRef}
            object={openingGroupRef.current}
            mode={transformTool === 'rotate' ? 'rotate' : 'translate'}
            size={0.72}
            showY={transformTool === 'rotate' || opening.type === 'window'}
            onMouseDown={() => onDraggingChange(true)}
            onObjectChange={() => {
              const obj = openingGroupRef.current;
              if (!obj) return;

              if (transformTool === 'rotate') {
                const deg = Number(
                  (((-obj.rotation.y * 180) / Math.PI) % 360 + 360) % 360
                );
                const next: StandaloneOpening = {
                  ...opening,
                  rotationDeg: Number(deg.toFixed(1)),
                };
                latestDraftRef.current = next;
                onLiveMove(next);
              } else {
                const rawPos: [number, number] = [
                  Number(obj.position.x.toFixed(3)),
                  Number(obj.position.z.toFixed(3)),
                ];
                const snapped = snapOpeningToWalls(
                  rawPos,
                  opening.rotationDeg,
                  walls,
                  0.6
                );
                const nextSill =
                  opening.type === 'window'
                    ? Number(Math.max(0, obj.position.y).toFixed(2))
                    : 0;

                obj.position.set(snapped.position[0], nextSill, snapped.position[1]);
                obj.rotation.set(0, (-snapped.rotationDeg * Math.PI) / 180, 0);

                const next: StandaloneOpening = {
                  ...opening,
                  position: snapped.position,
                  rotationDeg: snapped.rotationDeg,
                  sillHeightM: nextSill,
                  thicknessM: snapped.snappedWallThicknessM ?? opening.thicknessM,
                };
                latestDraftRef.current = next;
                onLiveMove(next);
              }
            }}
            onMouseUp={() => {
              onDraggingChange(false);
              const draft = latestDraftRef.current;

              if (transformTool === 'rotate') {
                const snappedDeg = Math.round(draft.rotationDeg / 15) * 15;
                onCommit({ rotationDeg: snappedDeg });
              } else {
                const snapped = snapOpeningToWalls(
                  draft.position,
                  draft.rotationDeg,
                  walls,
                  0.6
                );
                const patch: Partial<StandaloneOpening> = {
                  position: snapped.position,
                  rotationDeg: snapped.rotationDeg,
                  sillHeightM: draft.sillHeightM,
                };
                if (snapped.snappedWallThicknessM) {
                  patch.thicknessM = snapped.snappedWallThicknessM;
                }
                onCommit(patch);
              }
            }}
          />
        )}
    </>
  );
}

function WallVertexHandlesAndPivot({
  walls,
  selectedWallId,
  selectedVertex,
  linkedVertexJoint,
  autoStraightenVertices,
  snapTargets,
  ceilingHeightM,
  onSelectVertex,
  onLiveWallsChange,
  onCommitWalls,
  onDraggingChange,
}: {
  walls: WallSegment[];
  selectedWallId: string | null;
  selectedVertex: SelectedWallVertex | null;
  linkedVertexJoint: boolean;
  autoStraightenVertices: boolean;
  snapTargets: [number, number][];
  ceilingHeightM: number;
  onSelectVertex: (vertex: SelectedWallVertex | null) => void;
  onLiveWallsChange: (nextWalls: WallSegment[] | null) => void;
  onCommitWalls: (nextWalls: WallSegment[]) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [pivotObj, setPivotObj] = useState<THREE.Object3D | null>(null);
  const latestWallsRef = useRef<WallSegment[]>(walls);
  latestWallsRef.current = walls;

  const activeVertex = useMemo(() => {
    if (!selectedVertex) return null;
    const w = walls.find((item) => item.id === selectedVertex.wallId);
    if (!w) return null;
    const pt = selectedVertex.endKey === 'start' ? w.start : w.end;
    return {
      wallId: w.id,
      endKey: selectedVertex.endKey,
      point: pt,
    };
  }, [walls, selectedVertex]);

  const pinHeightM = ceilingHeightM + 0.18;
  const gizmoY = ceilingHeightM + 0.14;

  return (
    <group>
      {walls.map((w) => {
        const isWallFocused =
          selectedWallId === w.id || selectedVertex?.wallId === w.id;

        const baseRadius = Math.max(0.115, w.thicknessM * 0.68);

        return (
          <group key={`handles-${w.id}`}>
            {(['start', 'end'] as const).map((endKey) => {
              const pt = endKey === 'start' ? w.start : w.end;
              const isThisVertexSelected =
                selectedVertex?.wallId === w.id && selectedVertex?.endKey === endKey;

              if (!isWallFocused && !isThisVertexSelected) return null;

              const radius = isThisVertexSelected ? baseRadius + 0.03 : baseRadius;

              return (
                <group
                  key={`${w.id}-${endKey}`}
                  position={[pt[0], 0, pt[1]]}
                  onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    onSelectVertex({ wallId: w.id, endKey });
                  }}
                >
                  <mesh position={[0, pinHeightM / 2, 0]}>
                    <cylinderGeometry args={[radius, radius, pinHeightM, 20]} />
                    <meshStandardMaterial
                      color={isThisVertexSelected ? '#f59e0b' : '#0284c7'}
                      emissive={isThisVertexSelected ? '#d97706' : '#0369a1'}
                      emissiveIntensity={0.45}
                      roughness={0.3}
                    />
                  </mesh>
                  <mesh position={[0, pinHeightM + 0.04, 0]}>
                    <sphereGeometry args={[radius * 1.15, 18, 18]} />
                    <meshStandardMaterial
                      color={isThisVertexSelected ? '#fbbf24' : '#38bdf8'}
                      emissive={isThisVertexSelected ? '#b45309' : '#0284c7'}
                      emissiveIntensity={0.4}
                      roughness={0.25}
                    />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}

      {activeVertex && (
        <>
          <object3D
            ref={setPivotObj}
            position={[activeVertex.point[0], gizmoY, activeVertex.point[1]]}
          />
          {pivotObj && (
            <TransformControls
              object={pivotObj}
              mode="translate"
              size={0.8}
              showY={false}
              onMouseDown={() => onDraggingChange(true)}
              onObjectChange={() => {
                const nextWalls = applyVertexMoveToWalls(
                  walls,
                  activeVertex.wallId,
                  activeVertex.endKey,
                  [
                    Number(pivotObj.position.x.toFixed(3)),
                    Number(pivotObj.position.z.toFixed(3)),
                  ],
                  snapTargets,
                  {
                    linkedJoint: linkedVertexJoint,
                    autoStraighten: autoStraightenVertices,
                  }
                );

                const updatedW = nextWalls.find(
                  (item) => item.id === activeVertex.wallId
                );
                if (updatedW) {
                  const syncedPt =
                    activeVertex.endKey === 'start'
                      ? updatedW.start
                      : updatedW.end;
                  pivotObj.position.set(syncedPt[0], gizmoY, syncedPt[1]);
                }

                latestWallsRef.current = nextWalls;
                onLiveWallsChange(nextWalls);
              }}
              onMouseUp={() => {
                onDraggingChange(false);
                const finalWalls = latestWallsRef.current;
                onLiveWallsChange(null);
                onCommitWalls(finalWalls);
              }}
            />
          )}
        </>
      )}
    </group>
  );
}

function FloorZoneVertexHandlesAndPivot({
  floorZones,
  selectedFloorZoneId,
  selectedFloorVertex,
  snapTargets,
  segmentTargets,
  onSelectFloorVertex,
  onLiveFloorZonesChange,
  onCommitFloorZones,
  onDraggingChange,
}: {
  floorZones: FloorZone[];
  selectedFloorZoneId: string | null;
  selectedFloorVertex: SelectedFloorVertex | null;
  snapTargets: [number, number][];
  segmentTargets: SnapSegment[];
  onSelectFloorVertex: (vertex: SelectedFloorVertex | null) => void;
  onLiveFloorZonesChange: (nextZones: FloorZone[] | null) => void;
  onCommitFloorZones: (nextZones: FloorZone[]) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [pivotObj, setPivotObj] = useState<THREE.Object3D | null>(null);
  const latestZonesRef = useRef<FloorZone[]>(floorZones);
  latestZonesRef.current = floorZones;

  const focusedZoneId = selectedFloorVertex?.zoneId ?? selectedFloorZoneId;

  const activeVertex = useMemo(() => {
    if (!selectedFloorVertex) return null;
    const zone = floorZones.find((z) => z.id === selectedFloorVertex.zoneId);
    if (!zone) return null;
    const pt = zone.points[selectedFloorVertex.pointIndex];
    if (!pt) return null;
    return {
      zoneId: zone.id,
      pointIndex: selectedFloorVertex.pointIndex,
      point: pt,
    };
  }, [floorZones, selectedFloorVertex]);

  const pinHeightM = 0.28;
  const gizmoY = 0.22;

  return (
    <group>
      {floorZones.map((zone) => {
        if (zone.id !== focusedZoneId) return null;

        return (
          <group key={`floor-handles-${zone.id}`}>
            {zone.points.map((pt, idx) => {
              const isSelected =
                selectedFloorVertex?.zoneId === zone.id &&
                selectedFloorVertex?.pointIndex === idx;
              const radius = isSelected ? 0.095 : 0.075;

              return (
                <group
                  key={`${zone.id}-v-${idx}`}
                  position={[pt[0], 0, pt[1]]}
                  onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    onSelectFloorVertex({ zoneId: zone.id, pointIndex: idx });
                  }}
                >
                  <mesh position={[0, pinHeightM / 2, 0]}>
                    <cylinderGeometry args={[radius * 0.65, radius * 0.65, pinHeightM, 16]} />
                    <meshStandardMaterial
                      color={isSelected ? '#f59e0b' : '#10b981'}
                      emissive={isSelected ? '#d97706' : '#059669'}
                      emissiveIntensity={0.45}
                      roughness={0.3}
                    />
                  </mesh>
                  <mesh position={[0, pinHeightM + 0.03, 0]}>
                    <sphereGeometry args={[radius, 18, 18]} />
                    <meshStandardMaterial
                      color={isSelected ? '#fbbf24' : '#34d399'}
                      emissive={isSelected ? '#b45309' : '#059669'}
                      emissiveIntensity={0.45}
                      roughness={0.25}
                    />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}

      {activeVertex && (
        <>
          <object3D
            ref={setPivotObj}
            position={[activeVertex.point[0], gizmoY, activeVertex.point[1]]}
          />
          {pivotObj && (
            <TransformControls
              object={pivotObj}
              mode="translate"
              size={0.75}
              showY={false}
              onMouseDown={() => onDraggingChange(true)}
              onObjectChange={() => {
                const nextZones = applyVertexMoveToFloorZone(
                  floorZones,
                  activeVertex.zoneId,
                  activeVertex.pointIndex,
                  [
                    Number(pivotObj.position.x.toFixed(3)),
                    Number(pivotObj.position.z.toFixed(3)),
                  ],
                  snapTargets,
                  segmentTargets
                );

                const updatedZone = nextZones.find(
                  (z) => z.id === activeVertex.zoneId
                );
                const syncedPt = updatedZone?.points[activeVertex.pointIndex];
                if (syncedPt) {
                  pivotObj.position.set(syncedPt[0], gizmoY, syncedPt[1]);
                }

                latestZonesRef.current = nextZones;
                onLiveFloorZonesChange(nextZones);
              }}
              onMouseUp={() => {
                onDraggingChange(false);
                const finalZones = latestZonesRef.current;
                onLiveFloorZonesChange(null);
                onCommitFloorZones(finalZones);
              }}
            />
          )}
        </>
      )}
    </group>
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
      position={[fp.offsetX, 0.0005, fp.offsetZ]}
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
  polygonOffsetFactor = -1,
  textureMeta = null,
  uvw,
  legacyRotationDeg = 0,
  isSelected,
  isDropHovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
  onPointerUp,
}: {
  points: [number, number][];
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  yOffset: number;
  polygonOffsetFactor?: number;
  textureMeta?: CatalogTexture | null;
  uvw?: CustomUvwSettings;
  legacyRotationDeg?: number;
  isSelected: boolean;
  isDropHovered?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const mergedUvw: CustomUvwSettings = useMemo(
    () => ({
      ...uvw,
      rotationDeg: uvw?.rotationDeg ?? legacyRotationDeg,
    }),
    [uvw, legacyRotationDeg]
  );

  const { tileWM, tileHM, rotDeg, offU, offV } = resolveEffectiveTileMeters(
    textureMeta,
    mergedUvw
  );

  const repeatX = textureMeta ? 1 / tileWM : 1;
  const repeatY = textureMeta ? 1 / tileHM : 1;
  const mappedTexture = useScaledCatalogTexture(
    textureMeta,
    repeatX,
    repeatY,
    rotDeg,
    offU,
    offV
  );

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

  const effectiveRoughness = textureMeta
    ? textureMeta.roughness ?? roughness
    : roughness;
  const effectiveMetalness = textureMeta
    ? textureMeta.metalness ?? metalness
    : metalness;

  const highlightColor = isDropHovered
    ? '#34d399'
    : isSelected
      ? '#38bdf8'
      : mappedTexture
        ? '#ffffff'
        : color;

  return (
    <mesh
      geometry={geometry}
      position={[0, yOffset, 0]}
      receiveShadow
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerUp={onPointerUp}
    >
      <meshStandardMaterial
        key={mappedTexture ? `tex-${textureMeta?.id}` : 'solid-floor'}
        map={mappedTexture ?? undefined}
        color={highlightColor}
        roughness={effectiveRoughness}
        metalness={effectiveMetalness}
        transparent={opacity < 1}
        opacity={opacity}
        polygonOffset
        polygonOffsetFactor={polygonOffsetFactor}
        polygonOffsetUnits={-1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

type SolidSpan = {
  startM: number;
  endM: number;
  bottomY: number;
  topY: number;
};

function WallFaceSpanMesh({
  segLen,
  segHeight,
  localX,
  localY,
  zOffset,
  rotY,
  color,
  textureMeta,
  uvw,
  isSelected,
  isDropHovered,
}: {
  segLen: number;
  segHeight: number;
  localX: number;
  localY: number;
  zOffset: number;
  rotY: number;
  color: string;
  textureMeta: CatalogTexture | null;
  uvw?: CustomUvwSettings;
  isSelected: boolean;
  isDropHovered: boolean;
}) {
  const { tileWM, tileHM, rotDeg, offU, offV } = resolveEffectiveTileMeters(
    textureMeta,
    uvw
  );
  const repeatX = textureMeta ? segLen / tileWM : 1;
  const repeatY = textureMeta ? segHeight / tileHM : 1;
  const tex = useScaledCatalogTexture(
    textureMeta,
    repeatX,
    repeatY,
    rotDeg,
    offU,
    offV
  );

  const tintColor = isDropHovered
    ? '#34d399'
    : isSelected
      ? '#7dd3fc'
      : tex
        ? '#ffffff'
        : color;

  return (
    <mesh
      position={[localX, localY, zOffset]}
      rotation={[0, rotY, 0]}
      receiveShadow
    >
      <planeGeometry args={[segLen, segHeight]} />
      <meshStandardMaterial
        key={tex ? `wtex-${textureMeta?.id}` : 'wsolid'}
        map={tex ?? undefined}
        color={tintColor}
        roughness={textureMeta ? textureMeta.roughness ?? 0.78 : 0.78}
        metalness={textureMeta ? textureMeta.metalness ?? 0.04 : 0.04}
        polygonOffset
        polygonOffsetFactor={isSelected || isDropHovered ? -4 : -1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function WallFaceOverlay({
  spans,
  length,
  zOffset,
  rotY,
  baseColor,
  textureMeta,
  tileHeightM,
  uvw,
  isSelected,
  isDropHovered,
  onClick,
  onPointerOver,
  onPointerOut,
  onPointerUp,
}: {
  spans: SolidSpan[];
  length: number;
  zOffset: number;
  rotY: number;
  baseColor: string;
  textureMeta: CatalogTexture | null;
  tileHeightM?: number | null;
  uvw?: CustomUvwSettings;
  isSelected: boolean;
  isDropHovered: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const splitHeight =
    textureMeta && tileHeightM && tileHeightM > 0.05 ? tileHeightM : null;

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerUp={onPointerUp}
    >
      {spans.map((sp, idx) => {
        const segLen = sp.endM - sp.startM;
        const localX = (sp.startM + sp.endM) / 2 - length / 2;

        if (splitHeight !== null && sp.bottomY < splitHeight && sp.topY > splitHeight) {
          const lowerH = splitHeight - sp.bottomY;
          const upperH = sp.topY - splitHeight;
          return (
            <group key={`face-split-${idx}`}>
              <WallFaceSpanMesh
                segLen={segLen}
                segHeight={lowerH}
                localX={localX}
                localY={sp.bottomY + lowerH / 2}
                zOffset={zOffset}
                rotY={rotY}
                color={baseColor}
                textureMeta={textureMeta}
                uvw={uvw}
                isSelected={isSelected}
                isDropHovered={isDropHovered}
              />
              <WallFaceSpanMesh
                segLen={segLen}
                segHeight={upperH}
                localX={localX}
                localY={splitHeight + upperH / 2}
                zOffset={zOffset}
                rotY={rotY}
                color={baseColor}
                textureMeta={null}
                isSelected={isSelected}
                isDropHovered={isDropHovered}
              />
            </group>
          );
        }

        const isBelowTileLimit =
          splitHeight === null ? true : sp.topY <= splitHeight + 0.005;

        const segHeight = sp.topY - sp.bottomY;
        const localY = sp.bottomY + segHeight / 2;

        return (
          <WallFaceSpanMesh
            key={`face-span-${idx}`}
            segLen={segLen}
            segHeight={segHeight}
            localX={localX}
            localY={localY}
            zOffset={zOffset}
            rotY={rotY}
            color={baseColor}
            textureMeta={isBelowTileLimit ? textureMeta : null}
            uvw={isBelowTileLimit ? uvw : undefined}
            isSelected={isSelected}
            isDropHovered={isDropHovered}
          />
        );
      })}
    </group>
  );
}

function WallSegmentItem({
  wall,
  allWalls,
  standaloneOpenings,
  ceilingHeightM,
  models,
  texturesById,
  isWallSelected,
  isFrontFaceSelected,
  isBackFaceSelected,
  hoveredDropKey,
  draggedTextureId,
  selectedOpeningId,
  isDrawingWalls,
  isDrawingFloorZone,
  isCalibratingPlan,
  onSelectWallFace,
  onHoverDropTarget,
  onDropTextureOnTarget,
  onSelectOpening,
}: {
  wall: WallSegment;
  allWalls: WallSegment[];
  standaloneOpenings: StandaloneOpening[];
  ceilingHeightM: number;
  models: CatalogModel[];
  texturesById: Map<string, CatalogTexture>;
  isWallSelected: boolean;
  isFrontFaceSelected: boolean;
  isBackFaceSelected: boolean;
  hoveredDropKey: string | null;
  draggedTextureId: string | null;
  selectedOpeningId: string | null;
  isDrawingWalls: boolean;
  isDrawingFloorZone: boolean;
  isCalibratingPlan: boolean;
  onSelectWallFace: (side: 'front' | 'back', additive: boolean) => void;
  onHoverDropTarget: (key: string | null) => void;
  onDropTextureOnTarget: (target: SurfaceTarget) => void;
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

  const projectedStandaloneCutouts: WallOpening[] = [];
  for (const sop of standaloneOpenings) {
    const cut = projectStandaloneOpeningOntoWall(
      sop,
      wall.start,
      dirX,
      dirZ,
      effStartDist,
      length,
      thickness
    );
    if (cut) projectedStandaloneCutouts.push(cut);
  }

  const rawOpenings: WallOpening[] = [
    ...(wall.openings ?? []),
    ...projectedStandaloneCutouts,
  ];

  const validOpenings: WallOpening[] = rawOpenings
    .map((op) => {
      const w = Math.max(0.1, Math.min(op.widthM, length - 0.04));
      const start = Math.max(0, Math.min(op.offsetFromStartM, length - w));
      const sill = op.type === 'window' ? Math.max(0, op.sillHeightM) : 0;
      const h = Math.max(0.2, Math.min(op.heightM, ceilingHeightM - sill));
      return {
        ...op,
        offsetFromStartM: start,
        widthM: w,
        sillHeightM: sill,
        heightM: h,
      };
    })
    .filter((op) => op.widthM > 0.02)
    .sort((a, b) => a.offsetFromStartM - b.offsetFromStartM);

  const frontColor = wall.frontColor || '#f1f5f9';
  const backColor = wall.backColor || '#f1f5f9';
  const { startCapColor, endCapColor } = getWallEndCapColors(wall, allWalls);

  const isNeutralSelected =
    isWallSelected && !isFrontFaceSelected && !isBackFaceSelected;

  const topRimColor = isNeutralSelected ? '#93c5fd' : '#f1f5f9';
  const leftCapColor = isNeutralSelected ? '#93c5fd' : startCapColor;
  const rightCapColor = isNeutralSelected ? '#93c5fd' : endCapColor;

  const frontTex = wall.frontTextureId
    ? texturesById.get(wall.frontTextureId) ?? null
    : null;
  const backTex = wall.backTextureId
    ? texturesById.get(wall.backTextureId) ?? null
    : null;

  const wallBaseY = -0.004;

  const spans: SolidSpan[] = [];
  let cursorM = 0;

  for (const op of validOpenings) {
    if (op.offsetFromStartM > cursorM + 0.005) {
      spans.push({
        startM: cursorM,
        endM: op.offsetFromStartM,
        bottomY: wallBaseY,
        topY: ceilingHeightM,
      });
    }

    if (op.type === 'window' && op.sillHeightM > 0.005) {
      spans.push({
        startM: op.offsetFromStartM,
        endM: op.offsetFromStartM + op.widthM,
        bottomY: wallBaseY,
        topY: op.sillHeightM,
      });
    }

    const lintelBottomY = op.sillHeightM + op.heightM;
    if (ceilingHeightM > lintelBottomY + 0.005) {
      spans.push({
        startM: op.offsetFromStartM,
        endM: op.offsetFromStartM + op.widthM,
        bottomY: lintelBottomY,
        topY: ceilingHeightM,
      });
    }

    cursorM = Math.max(cursorM, op.offsetFromStartM + op.widthM);
  }

  if (length > cursorM + 0.005) {
    spans.push({
      startM: cursorM,
      endM: length,
      bottomY: wallBaseY,
      topY: ceilingHeightM,
    });
  }

  const frontTarget: SurfaceTarget = {
    kind: 'wall',
    wallId: wall.id,
    side: 'front',
  };
  const backTarget: SurfaceTarget = {
    kind: 'wall',
    wallId: wall.id,
    side: 'back',
  };
  const frontKey = surfaceKey(frontTarget);
  const backKey = surfaceKey(backTarget);

  const isBusy = isDrawingWalls || isDrawingFloorZone || isCalibratingPlan;

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, -angleRad, 0]}>
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
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (isBusy) return;
              e.stopPropagation();
              const nz = e.face?.normal?.z ?? 1;
              const side: 'front' | 'back' = nz < 0 ? 'back' : 'front';
              onSelectWallFace(side, Boolean(e.shiftKey));
            }}
          >
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial
              attach="material-0"
              color={rightCapColor}
              roughness={0.78}
              metalness={0.04}
            />
            <meshStandardMaterial
              attach="material-1"
              color={leftCapColor}
              roughness={0.78}
              metalness={0.04}
            />
            <meshStandardMaterial
              attach="material-2"
              color={topRimColor}
              roughness={0.78}
              metalness={0.04}
            />
            <meshStandardMaterial
              attach="material-3"
              color={topRimColor}
              roughness={0.78}
              metalness={0.04}
            />
            <meshStandardMaterial
              attach="material-4"
              color={frontColor}
              roughness={0.78}
              metalness={0.04}
            />
            <meshStandardMaterial
              attach="material-5"
              color={backColor}
              roughness={0.78}
              metalness={0.04}
            />
          </mesh>
        );
      })}

      <WallFaceOverlay
        spans={spans}
        length={length}
        zOffset={thickness / 2 + 0.002}
        rotY={0}
        baseColor={frontColor}
        textureMeta={frontTex}
        tileHeightM={wall.frontTileHeightM}
        uvw={wall.frontUvw}
        isSelected={isFrontFaceSelected}
        isDropHovered={hoveredDropKey === frontKey}
        onClick={(e) => {
          if (isBusy) return;
          e.stopPropagation();
          onSelectWallFace('front', Boolean(e.shiftKey));
        }}
        onPointerOver={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          onHoverDropTarget(frontKey);
        }}
        onPointerOut={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          if (hoveredDropKey === frontKey) onHoverDropTarget(null);
        }}
        onPointerUp={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          onDropTextureOnTarget(frontTarget);
        }}
      />

      <WallFaceOverlay
        spans={spans}
        length={length}
        zOffset={-(thickness / 2 + 0.002)}
        rotY={Math.PI}
        baseColor={backColor}
        textureMeta={backTex}
        tileHeightM={wall.backTileHeightM}
        uvw={wall.backUvw}
        isSelected={isBackFaceSelected}
        isDropHovered={hoveredDropKey === backKey}
        onClick={(e) => {
          if (isBusy) return;
          e.stopPropagation();
          onSelectWallFace('back', Boolean(e.shiftKey));
        }}
        onPointerOver={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          onHoverDropTarget(backKey);
        }}
        onPointerOut={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          if (hoveredDropKey === backKey) onHoverDropTarget(null);
        }}
        onPointerUp={(e) => {
          if (!draggedTextureId) return;
          e.stopPropagation();
          onDropTextureOnTarget(backTarget);
        }}
      />

      {(wall.openings ?? []).map((op) => {
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
              if (isBusy) return;
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
                op.frameColor,
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
  textures = [],
  selectedWallId,
  selectedOpeningId,
  selectedStandaloneOpeningId,
  selectedFloorZoneId = null,
  selectedSurfaces = [],
  draggedTextureId = null,
  selectedWallVertex = null,
  selectedFloorVertex = null,
  linkedVertexJoint = true,
  autoStraightenVertices = true,
  onSelectWall,
  onSelectSurface,
  onDropTextureOnSurface,
  onSelectOpening,
  onSelectStandaloneOpening,
  onSelectFloorZone,
  onSelectWallVertex,
  onSelectFloorVertex,
  onUpdateStandaloneOpening,
  onCommitWallsFromVertex,
  onCommitFloorZonesFromVertex,
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
  const [liveOpening, setLiveOpening] = useState<StandaloneOpening | null>(null);
  const [liveWalls, setLiveWalls] = useState<WallSegment[] | null>(null);
  const [liveFloorZones, setLiveFloorZones] = useState<FloorZone[] | null>(null);
  const [hoveredDropKey, setHoveredDropKey] = useState<string | null>(null);

  useEffect(() => {
    if (!draggedTextureId) {
      setHoveredDropKey(null);
    }
  }, [draggedTextureId]);

  const texturesById = useMemo(
    () => new Map(textures.map((t) => [t.id, t])),
    [textures]
  );

  useEffect(() => {
    setLiveOpening(null);
  }, [selectedStandaloneOpeningId, room.openings]);

  useEffect(() => {
    setLiveWalls(null);
  }, [room.walls]);

  useEffect(() => {
    setLiveFloorZones(null);
  }, [room.floorZones]);

  const effectiveWalls = useMemo(() => {
    const base = liveWalls ?? room.walls;
    const byKey = new Map<string, WallSegment>();

    for (const w of base) {
      const a = `${w.start[0].toFixed(3)},${w.start[1].toFixed(3)}`;
      const b = `${w.end[0].toFixed(3)},${w.end[1].toFixed(3)}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;

      const existing = byKey.get(key);
      if (!existing || w.id === selectedWallId || selectedWallVertex?.wallId === w.id) {
        byKey.set(key, w);
      }
    }

    return Array.from(byKey.values());
  }, [liveWalls, room.walls, selectedWallId, selectedWallVertex]);

  const autoPolygons = useMemo(() => {
    const raw = findClosedRoomPolygons(effectiveWalls);
    const seen = new Set<string>();
    return raw.filter((poly) => {
      const key = [...poly]
        .map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`)
        .sort()
        .join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [effectiveWalls]);

  const floorZones: FloorZone[] = useMemo(
    () => liveFloorZones ?? (room.floorZones ?? []),
    [liveFloorZones, room.floorZones]
  );

  const effectiveStandaloneOpenings = useMemo(() => {
    const base = room.openings ?? [];
    if (!liveOpening) return base;
    return base.map((op) => (op.id === liveOpening.id ? liveOpening : op));
  }, [room.openings, liveOpening]);

  const { pointTargets: snapTargets, segmentTargets } = useMemo(
    () =>
      buildRoomSnapData(
        effectiveWalls,
        floorZones,
        effectiveStandaloneOpenings
      ),
    [effectiveWalls, floorZones, effectiveStandaloneOpenings]
  );

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
    return snapDrawingPoint(
      hoverPoint,
      anchorPoint,
      snapTargets,
      45,
      false,
      segmentTargets,
      activeDraftPts
    );
  }, [
    isDrawingWalls,
    isDrawingFloorZone,
    hoverPoint,
    activeDraftPts,
    anchorPoint,
    snapTargets,
    segmentTargets,
  ]);

  const isAnyDrawMode = isDrawingWalls || isDrawingFloorZone;

  const computeSnappedPoint = (raw: [number, number]): [number, number] => {
    if (activeDraftPts.length >= 3) {
      const first = activeDraftPts[0];
      if (Math.hypot(raw[0] - first[0], raw[1] - first[1]) <= 0.25) {
        return [first[0], first[1]];
      }
    }
    return snapDrawingPoint(
      raw,
      anchorPoint,
      snapTargets,
      45,
      false,
      segmentTargets,
      activeDraftPts
    );
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.005, 0]}
        receiveShadow
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!isAnyDrawMode && !isCalibratingPlan) return;
          e.stopPropagation();
          const raw: [number, number] = [
            Number(e.point.x.toFixed(3)),
            Number(e.point.z.toFixed(3)),
          ];
          if (isCalibratingPlan) {
            onHoverPointChange(raw);
          } else {
            onHoverPointChange(computeSnappedPoint(raw));
          }
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
          const snapped = computeSnappedPoint(raw);

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

      {autoPolygons.map((poly, idx) => (
        <FloorZonePolygonMesh
          key={`auto-floor-${idx}`}
          points={poly}
          color="#cbd5e1"
          roughness={0.7}
          metalness={0.05}
          opacity={0.35}
          yOffset={0.001 + idx * 0.0005}
          polygonOffsetFactor={-1 - idx}
          isSelected={false}
          onClick={(e) => {
            if (isCalibratingPlan) return;
            if (isAnyDrawMode) {
              e.stopPropagation();
              const raw: [number, number] = [
                Number(e.point.x.toFixed(3)),
                Number(e.point.z.toFixed(3)),
              ];
              const snapped = computeSnappedPoint(raw);
              if (isDrawingFloorZone && onFloorZoneDrawClick) {
                onFloorZoneDrawClick(snapped);
              } else {
                onFloorDrawClick(snapped);
              }
              return;
            }
            e.stopPropagation();
            onSelectWall(null);
            onSelectStandaloneOpening(null);
            onSelectFloorZone?.(null);
            onSelectWallVertex?.(null);
            onSelectFloorVertex?.(null);
          }}
        />
      ))}

      {room.showCeiling &&
        autoPolygons.map((poly, idx) => (
          <FloorZonePolygonMesh
            key={`ceiling-${idx}`}
            points={poly}
            color={room.ceilingColor || '#f8fafc'}
            roughness={0.85}
            metalness={0.02}
            opacity={1}
            yOffset={room.ceilingHeightM}
            polygonOffsetFactor={-1}
            isSelected={false}
          />
        ))}

      {floorZones.map((zone, idx) => {
        const texMeta = zone.textureId
          ? texturesById.get(zone.textureId) ?? null
          : null;
        const zoneTarget: SurfaceTarget = { kind: 'floor', zoneId: zone.id };
        const zoneKey = surfaceKey(zoneTarget);
        const isZoneSelected =
          selectedFloorZoneId === zone.id ||
          selectedSurfaces.some((s) => isSameSurface(s, zoneTarget));

        return (
          <FloorZonePolygonMesh
            key={zone.id}
            points={zone.points}
            color={zone.color || '#b08968'}
            roughness={zone.roughness ?? 0.55}
            metalness={zone.metalness ?? 0.05}
            opacity={1}
            yOffset={0.003 + idx * 0.001}
            polygonOffsetFactor={-6 - idx}
            textureMeta={texMeta}
            uvw={zone.uvw}
            legacyRotationDeg={zone.textureRotationDeg ?? 0}
            isSelected={isZoneSelected}
            isDropHovered={hoveredDropKey === zoneKey}
            onClick={(e) => {
              if (isCalibratingPlan) return;
              if (isAnyDrawMode) {
                e.stopPropagation();
                const raw: [number, number] = [
                  Number(e.point.x.toFixed(3)),
                  Number(e.point.z.toFixed(3)),
                ];
                const snapped = computeSnappedPoint(raw);
                if (isDrawingFloorZone && onFloorZoneDrawClick) {
                  onFloorZoneDrawClick(snapped);
                } else {
                  onFloorDrawClick(snapped);
                }
                return;
              }
              e.stopPropagation();
              if (onSelectSurface) {
                onSelectSurface(zoneTarget, Boolean(e.shiftKey));
              } else {
                onSelectFloorZone?.(zone.id);
              }
            }}
            onPointerOver={(e) => {
              if (!draggedTextureId) return;
              e.stopPropagation();
              setHoveredDropKey(zoneKey);
            }}
            onPointerOut={(e) => {
              if (!draggedTextureId) return;
              e.stopPropagation();
              if (hoveredDropKey === zoneKey) setHoveredDropKey(null);
            }}
            onPointerUp={(e) => {
              if (!draggedTextureId) return;
              e.stopPropagation();
              setHoveredDropKey(null);
              onDropTextureOnSurface?.(zoneTarget, draggedTextureId);
            }}
          />
        );
      })}

      {effectiveWalls.map((wall) => {
        const isFrontSelected = selectedSurfaces.some((s) =>
          isSameSurface(s, { kind: 'wall', wallId: wall.id, side: 'front' })
        );
        const isBackSelected = selectedSurfaces.some((s) =>
          isSameSurface(s, { kind: 'wall', wallId: wall.id, side: 'back' })
        );

        return (
          <WallSegmentItem
            key={wall.id}
            wall={wall}
            allWalls={effectiveWalls}
            standaloneOpenings={effectiveStandaloneOpenings}
            ceilingHeightM={room.ceilingHeightM}
            models={models}
            texturesById={texturesById}
            isWallSelected={selectedWallId === wall.id}
            isFrontFaceSelected={isFrontSelected}
            isBackFaceSelected={isBackSelected}
            hoveredDropKey={hoveredDropKey}
            draggedTextureId={draggedTextureId}
            selectedOpeningId={selectedOpeningId}
            isDrawingWalls={isDrawingWalls}
            isDrawingFloorZone={isDrawingFloorZone}
            isCalibratingPlan={isCalibratingPlan}
            onSelectWallFace={(side, additive) => {
              if (onSelectSurface) {
                onSelectSurface({ kind: 'wall', wallId: wall.id, side }, additive);
              } else {
                onSelectWall(wall.id);
              }
            }}
            onHoverDropTarget={setHoveredDropKey}
            onDropTextureOnTarget={(target) => {
              setHoveredDropKey(null);
              if (draggedTextureId) {
                onDropTextureOnSurface?.(target, draggedTextureId);
              }
            }}
            onSelectOpening={(opId) => onSelectOpening(wall.id, opId)}
          />
        );
      })}

      {!isAnyDrawMode && !isCalibratingPlan && (
        <WallVertexHandlesAndPivot
          walls={effectiveWalls}
          selectedWallId={selectedWallId}
          selectedVertex={selectedWallVertex}
          linkedVertexJoint={linkedVertexJoint}
          autoStraightenVertices={autoStraightenVertices}
          snapTargets={snapTargets}
          ceilingHeightM={room.ceilingHeightM}
          onSelectVertex={(v) => onSelectWallVertex?.(v)}
          onLiveWallsChange={setLiveWalls}
          onCommitWalls={(nextWalls) => onCommitWallsFromVertex?.(nextWalls)}
          onDraggingChange={onDraggingChange}
        />
      )}

      {!isAnyDrawMode && !isCalibratingPlan && (
        <FloorZoneVertexHandlesAndPivot
          floorZones={floorZones}
          selectedFloorZoneId={selectedFloorZoneId}
          selectedFloorVertex={selectedFloorVertex}
          snapTargets={snapTargets}
          segmentTargets={segmentTargets}
          onSelectFloorVertex={(v) => onSelectFloorVertex?.(v)}
          onLiveFloorZonesChange={setLiveFloorZones}
          onCommitFloorZones={(nextZones) =>
            onCommitFloorZonesFromVertex?.(nextZones)
          }
          onDraggingChange={onDraggingChange}
        />
      )}

      {effectiveStandaloneOpenings.map((op) => (
        <StandaloneOpeningItem
          key={op.id}
          opening={op}
          models={models}
          walls={effectiveWalls}
          isSelected={selectedStandaloneOpeningId === op.id}
          isDrawingWalls={isDrawingWalls}
          isDrawingFloorZone={isDrawingFloorZone}
          isCalibratingPlan={isCalibratingPlan}
          transformTool={transformTool}
          onSelect={() => onSelectStandaloneOpening(op.id)}
          onLiveMove={(next) => setLiveOpening(next)}
          onCommit={(patch) => {
            setLiveOpening(null);
            onUpdateStandaloneOpening(op.id, patch);
          }}
          onDraggingChange={onDraggingChange}
        />
      ))}

      {isAnyDrawMode &&
        activeDraftPts.map((pt, idx) => (
          <mesh key={`draft-pt-${idx}`} position={[pt[0], 0.04, pt[1]]}>
            <sphereGeometry args={[idx === 0 ? 0.085 : 0.065, 16, 16]} />
            <meshBasicMaterial
              color={
                isDrawingFloorZone
                  ? idx === 0
                    ? '#22c55e'
                    : '#f59e0b'
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

      {isAnyDrawMode && !anchorPoint && snappedHover && (
        <mesh position={[snappedHover[0], 0.045, snappedHover[1]]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshBasicMaterial color={isDrawingFloorZone ? '#fbbf24' : '#38bdf8'} />
        </mesh>
      )}

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
            <mesh position={[snappedHover[0], 0.045, snappedHover[1]]}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshBasicMaterial color={isDrawingFloorZone ? '#fbbf24' : '#38bdf8'} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}