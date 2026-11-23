import { useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CatalogModel, SceneObject, TransformTool } from '../types/editor';
import type {
  RoomConfig,
  SelectedWallVertex,
  StandaloneOpening,
  WallSegment,
} from '../types/room';
import { RoomMesh } from './RoomMesh';
import { SceneItemMesh } from './SceneItemMesh';

export type ViewportCameraMode = '3d' | 'top';

interface Viewport3DProps {
  room: RoomConfig;
  viewMode?: ViewportCameraMode;
  selectedWallId?: string | null;
  selectedOpeningId?: string | null;
  selectedStandaloneOpeningId?: string | null;
  selectedFloorZoneId?: string | null;
  selectedWallVertex?: SelectedWallVertex | null;
  linkedVertexJoint?: boolean;
  autoStraightenVertices?: boolean;
  onSelectWall?: (wallId: string | null) => void;
  onSelectOpening?: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening?: (openingId: string | null) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onSelectWallVertex?: (vertex: SelectedWallVertex | null) => void;
  onUpdateStandaloneOpening?: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onCommitWallsFromVertex?: (nextWalls: WallSegment[]) => void;
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
  selectedInstanceId: string | null;
  transformTool: TransformTool;
  onSelectObject: (instanceId: string | null) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
}

export function Viewport3D({
  room,
  viewMode = '3d',
  selectedWallId = null,
  selectedOpeningId = null,
  selectedStandaloneOpeningId = null,
  selectedFloorZoneId = null,
  selectedWallVertex = null,
  linkedVertexJoint = true,
  autoStraightenVertices = true,
  onSelectWall,
  onSelectOpening,
  onSelectStandaloneOpening,
  onSelectFloorZone,
  onSelectWallVertex,
  onUpdateStandaloneOpening,
  onCommitWallsFromVertex,
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
  selectedInstanceId,
  transformTool,
  onSelectObject,
  onTransformChange,
}: Viewport3DProps) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [isDraggingObject, setIsDraggingObject] = useState(false);

  const isTopOrtho = viewMode === 'top';
  const isBusyDrawingOrCalib =
    isDrawingWalls || isDrawingFloorZone || isCalibratingPlan;

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
        transformTool={transformTool}
        selectedWallId={selectedWallId}
        selectedOpeningId={selectedOpeningId}
        selectedStandaloneOpeningId={selectedStandaloneOpeningId}
        selectedFloorZoneId={selectedFloorZoneId}
        selectedWallVertex={selectedWallVertex}
        linkedVertexJoint={linkedVertexJoint}
        autoStraightenVertices={autoStraightenVertices}
        onSelectWall={(wallId) => onSelectWall?.(wallId)}
        onSelectOpening={(wallId, openingId) => onSelectOpening?.(wallId, openingId)}
        onSelectStandaloneOpening={(openingId) =>
          onSelectStandaloneOpening?.(openingId)
        }
        onSelectFloorZone={onSelectFloorZone}
        onSelectWallVertex={onSelectWallVertex}
        onUpdateStandaloneOpening={(openingId, patch) =>
          onUpdateStandaloneOpening?.(openingId, patch)
        }
        onCommitWallsFromVertex={onCommitWallsFromVertex}
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

      {sceneObjects.map((obj) => {
        const model = models.find((m) => m.id === obj.modelId);
        if (!model) return null;

        return (
          <SceneItemMesh
            key={obj.instanceId}
            item={obj}
            model={model}
            isSelected={!isBusyDrawingOrCalib && obj.instanceId === selectedInstanceId}
            transformTool={transformTool}
            onSelect={(id) => {
              if (!isBusyDrawingOrCalib) {
                onSelectObject(id);
                onSelectWall?.(null);
                onSelectStandaloneOpening?.(null);
                onSelectFloorZone?.(null);
                onSelectWallVertex?.(null);
              }
            }}
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