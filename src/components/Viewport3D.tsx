import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  Environment,
  Grid,
  Html,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type {
  CatalogModel,
  CatalogTexture,
  SceneObject,
  TransformTool,
} from '../types/editor';
import type {
  FloorZone,
  RoomConfig,
  SelectedFloorVertex,
  SelectedWallVertex,
  StandaloneOpening,
  SurfaceTarget,
  WallSegment,
} from '../types/room';
import { RoomMesh } from './RoomMesh';
import { SceneItemMesh } from './SceneItemMesh';
import type { DiscoveredMaterialSlot } from './SceneItemMesh';

export type ViewportCameraMode = '3d' | 'top';

interface Viewport3DProps {
  room: RoomConfig;
  viewMode?: ViewportCameraMode;
  selectedWallId?: string | null;
  selectedOpeningId?: string | null;
  selectedStandaloneOpeningId?: string | null;
  selectedFloorZoneId?: string | null;
  selectedSurfaces?: SurfaceTarget[];
  draggedTextureId?: string | null;
  selectedWallVertex?: SelectedWallVertex | null;
  selectedFloorVertex?: SelectedFloorVertex | null;
  linkedVertexJoint?: boolean;
  autoStraightenVertices?: boolean;
  onSelectWall?: (wallId: string | null) => void;
  onSelectSurface?: (target: SurfaceTarget, additive: boolean) => void;
  onClearSurfaceSelection?: () => void;
  onDropTextureOnSurface?: (target: SurfaceTarget, textureId: string) => void;
  onSelectOpening?: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening?: (openingId: string | null) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onSelectWallVertex?: (vertex: SelectedWallVertex | null) => void;
  onSelectFloorVertex?: (vertex: SelectedFloorVertex | null) => void;
  onUpdateStandaloneOpening?: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onCommitWallsFromVertex?: (nextWalls: WallSegment[]) => void;
  onCommitFloorZonesFromVertex?: (nextZones: FloorZone[]) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
  hoverPoint?: [number, number] | null;
  onHoverPointChange?: (pt: [number, number] | null) => void;
  onFloorDrawClick?: (point: [number, number]) => void;
  onBreakDrawChain?: () => void;
  isDrawingFloorZone?: boolean;
  zoneDraftPoints?: [number, number][];
  onFloorZoneDrawClick?: (point: [number, number]) => void;
  isCalibratingPlan?: boolean;
  calibPoints?: [number, number][];
  onCalibFloorClick?: (point: [number, number]) => void;
  sceneObjects: SceneObject[];
  models: CatalogModel[];
  textures?: CatalogTexture[];
  selectedInstanceId: string | null;
  transformTool: TransformTool;
  onSelectObject: (instanceId: string | null) => void;
  onMaterialsDiscovered?: (
    instanceId: string,
    slots: DiscoveredMaterialSlot[]
  ) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
}

interface SegmentDimensionBadge {
  key: string;
  position: [number, number, number];
  lengthM: number;
  angleDeg: number;
  isActivePreview: boolean;
}

function computeSegmentBadge(
  p1: [number, number],
  p2: [number, number],
  key: string,
  isActivePreview: boolean,
  yHeight: number
): SegmentDimensionBadge | null {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const lengthM = Math.hypot(dx, dz);
  if (lengthM < 0.02) return null;

  const midX = (p1[0] + p2[0]) / 2;
  const midZ = (p1[1] + p2[1]) / 2;

  const nx = -dz / lengthM;
  const nz = dx / lengthM;
  const offset = 0.28;

  let angleDeg = Math.round(((Math.atan2(dz, dx) * 180) / Math.PI) * 10) / 10;
  if (angleDeg < 0) angleDeg += 360;

  return {
    key,
    position: [midX + nx * offset, yHeight, midZ + nz * offset],
    lengthM: Math.round(lengthM * 100) / 100,
    angleDeg,
    isActivePreview,
  };
}

export function Viewport3D({
  room,
  viewMode = '3d',
  selectedWallId = null,
  selectedOpeningId = null,
  selectedStandaloneOpeningId = null,
  selectedFloorZoneId = null,
  selectedSurfaces = [],
  draggedTextureId = null,
  selectedWallVertex = null,
  selectedFloorVertex = null,
  linkedVertexJoint = true,
  autoStraightenVertices = true,
  onSelectWall,
  onSelectSurface,
  onClearSurfaceSelection,
  onDropTextureOnSurface,
  onSelectOpening,
  onSelectStandaloneOpening,
  onSelectFloorZone,
  onSelectWallVertex,
  onSelectFloorVertex,
  onUpdateStandaloneOpening,
  onCommitWallsFromVertex,
  onCommitFloorZonesFromVertex,
  isDrawingWalls = false,
  draftPoints = [],
  hoverPoint = null,
  onHoverPointChange,
  onFloorDrawClick,
  isDrawingFloorZone = false,
  zoneDraftPoints = [],
  onFloorZoneDrawClick,
  isCalibratingPlan = false,
  calibPoints = [],
  onCalibFloorClick,
  sceneObjects,
  models,
  textures = [],
  selectedInstanceId,
  transformTool,
  onSelectObject,
  onMaterialsDiscovered,
  onTransformChange,
}: Viewport3DProps) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [isDraggingObject, setIsDraggingObject] = useState(false);

  const isTopOrtho = viewMode === 'top';
  const isBusyDrawingOrCalib =
    isDrawingWalls || isDrawingFloorZone || isCalibratingPlan;

  const liveDimensionBadges = useMemo(() => {
    const badges: SegmentDimensionBadge[] = [];
    const labelY = Math.max(0.25, room.ceilingHeightM + 0.15);

    if (isDrawingWalls && draftPoints.length > 0) {
      for (let i = 0; i < draftPoints.length - 1; i++) {
        const b = computeSegmentBadge(
          draftPoints[i],
          draftPoints[i + 1],
          `chain-${i}`,
          false,
          labelY
        );
        if (b) badges.push(b);
      }

      if (hoverPoint) {
        const lastPt = draftPoints[draftPoints.length - 1];
        const previewBadge = computeSegmentBadge(
          lastPt,
          hoverPoint,
          'active-preview',
          true,
          labelY
        );
        if (previewBadge) badges.push(previewBadge);
      }
    } else if (isDrawingFloorZone && zoneDraftPoints.length > 0 && hoverPoint) {
      const lastPt = zoneDraftPoints[zoneDraftPoints.length - 1];
      const zonePreview = computeSegmentBadge(
        lastPt,
        hoverPoint,
        'zone-preview',
        true,
        0.25
      );
      if (zonePreview) badges.push(zonePreview);
    } else if (isCalibratingPlan && calibPoints.length === 1 && hoverPoint) {
      const calibPreview = computeSegmentBadge(
        calibPoints[0],
        hoverPoint,
        'calib-preview',
        true,
        0.25
      );
      if (calibPreview) badges.push(calibPreview);
    }

    return badges;
  }, [
    isDrawingWalls,
    draftPoints,
    hoverPoint,
    isDrawingFloorZone,
    zoneDraftPoints,
    isCalibratingPlan,
    calibPoints,
    room.ceilingHeightM,
  ]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      onPointerMissed={() => {
        if (!isBusyDrawingOrCalib) {
          onSelectObject(null);
          onSelectWall?.(null);
          onSelectStandaloneOpening?.(null);
          onSelectFloorZone?.(null);
          onSelectWallVertex?.(null);
          onSelectFloorVertex?.(null);
          onClearSurfaceSelection?.();
        }
      }}
    >
      <color attach="background" args={['#0b1120']} />

      {isTopOrtho ? (
        <OrthographicCamera
          makeDefault
          position={[0, 20, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          zoom={55}
          near={0.1}
          far={100}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={[5.5, 5.5, 6.5]}
          fov={45}
          near={0.1}
          far={150}
        />
      )}

      <ambientLight intensity={0.65} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={35}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0004}
      />

      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={1.6}
          color="#ffffff"
          position={[0, 6, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[10, 10, 1]}
        />
        <Lightformer
          form="circle"
          intensity={1.2}
          color="#e2e8f0"
          position={[-6, 4, -4]}
          scale={5}
        />
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#cbd5e1"
          position={[6, 3, 5]}
          scale={[6, 3, 1]}
        />
      </Environment>

      <Grid
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1e293b"
        sectionSize={1}
        sectionThickness={1.2}
        sectionColor="#334155"
        fadeDistance={36}
        fadeStrength={1.5}
        position={[0, 0, 0]}
      />

      <RoomMesh
        room={room}
        models={models}
        textures={textures}
        transformTool={transformTool}
        selectedWallId={selectedWallId}
        selectedOpeningId={selectedOpeningId}
        selectedStandaloneOpeningId={selectedStandaloneOpeningId}
        selectedFloorZoneId={selectedFloorZoneId}
        selectedSurfaces={selectedSurfaces}
        draggedTextureId={draggedTextureId}
        selectedWallVertex={selectedWallVertex}
        selectedFloorVertex={selectedFloorVertex}
        linkedVertexJoint={linkedVertexJoint}
        autoStraightenVertices={autoStraightenVertices}
        onSelectWall={(wallId) => onSelectWall?.(wallId)}
        onSelectSurface={onSelectSurface}
        onDropTextureOnSurface={onDropTextureOnSurface}
        onSelectOpening={(wallId, openingId) => onSelectOpening?.(wallId, openingId)}
        onSelectStandaloneOpening={(openingId) =>
          onSelectStandaloneOpening?.(openingId)
        }
        onSelectFloorZone={onSelectFloorZone}
        onSelectWallVertex={onSelectWallVertex}
        onSelectFloorVertex={onSelectFloorVertex}
        onUpdateStandaloneOpening={(openingId, patch) =>
          onUpdateStandaloneOpening?.(openingId, patch)
        }
        onCommitWallsFromVertex={onCommitWallsFromVertex}
        onCommitFloorZonesFromVertex={onCommitFloorZonesFromVertex}
        onDraggingChange={setIsDraggingObject}
        isDrawingWalls={isDrawingWalls}
        draftPoints={draftPoints}
        hoverPoint={hoverPoint}
        onHoverPointChange={(pt) => onHoverPointChange?.(pt)}
        onFloorDrawClick={(pt) => onFloorDrawClick?.(pt)}
        isDrawingFloorZone={isDrawingFloorZone}
        zoneDraftPoints={zoneDraftPoints}
        onFloorZoneDrawClick={onFloorZoneDrawClick}
        isCalibratingPlan={isCalibratingPlan}
        calibPoints={calibPoints}
        onCalibFloorClick={onCalibFloorClick}
      />

      {liveDimensionBadges.map((badge) => {
        const cm = Math.round(badge.lengthM * 100);
        return (
          <Html
            key={badge.key}
            position={badge.position}
            center
            zIndexRange={[20, 0]}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div
              style={{
                backgroundColor: badge.isActivePreview
                  ? 'rgba(14, 116, 144, 0.95)'
                  : 'rgba(15, 23, 42, 0.88)',
                border: badge.isActivePreview
                  ? '1.5px solid #38bdf8'
                  : '1px solid #475569',
                color: badge.isActivePreview ? '#f0f9ff' : '#cbd5e1',
                padding: badge.isActivePreview ? '3px 8px' : '2px 6px',
                borderRadius: '5px',
                fontSize: badge.isActivePreview ? '12px' : '10px',
                fontWeight: badge.isActivePreview ? 700 : 500,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {badge.isActivePreview
                ? `${badge.lengthM.toFixed(2)} м (${cm} см) • ${badge.angleDeg}°`
                : `${badge.lengthM.toFixed(2)} м`}
            </div>
          </Html>
        );
      })}

      {sceneObjects.map((obj) => {
        const model = models.find((m) => m.id === obj.modelId);
        if (!model) return null;

        return (
          <SceneItemMesh
            key={obj.instanceId}
            item={obj}
            model={model}
            textures={textures}
            isSelected={!isBusyDrawingOrCalib && obj.instanceId === selectedInstanceId}
            transformTool={transformTool}
            onSelect={(id) => {
              if (!isBusyDrawingOrCalib) {
                onSelectObject(id);
                onSelectWall?.(null);
                onSelectStandaloneOpening?.(null);
                onSelectFloorZone?.(null);
                onSelectWallVertex?.(null);
                onSelectFloorVertex?.(null);
                onClearSurfaceSelection?.();
              }
            }}
            onMaterialsDiscovered={onMaterialsDiscovered}
            onTransformChange={onTransformChange}
            onDraggingChange={setIsDraggingObject}
          />
        );
      })}

      <OrbitControls
        key={viewMode}
        ref={orbitRef}
        makeDefault
        enabled={!isDraggingObject}
        enableDamping
        dampingFactor={0.08}
        enableRotate={!isTopOrtho}
        mouseButtons={
          isTopOrtho
            ? {
                LEFT: isBusyDrawingOrCalib ? undefined : THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
              }
            : {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }
        }
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={1.2}
        maxDistance={40}
        minZoom={12}
        maxZoom={220}
      />
    </Canvas>
  );
}