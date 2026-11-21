import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CatalogModel, SceneObject, TransformTool } from '../types/editor';
import type { RoomConfig } from '../types/room';
import { RoomMesh } from './RoomMesh';
import { SceneItemMesh } from './SceneItemMesh';

export type ViewportCameraMode = '3d' | 'top';

interface Viewport3DProps {
  room: RoomConfig;
  viewMode?: ViewportCameraMode;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
  hoverPoint?: [number, number] | null;
  onHoverPointChange?: (pt: [number, number] | null) => void;
  onFloorDrawClick?: (point: [number, number]) => void;
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

interface CameraModeControllerProps {
  viewMode: ViewportCameraMode;
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}

function CameraModeController({ viewMode, orbitRef }: CameraModeControllerProps) {
  const { camera } = useThree();
  const prevModeRef = useRef<ViewportCameraMode>(viewMode);

  useEffect(() => {
    if (prevModeRef.current === viewMode) return;
    prevModeRef.current = viewMode;

    const controls = orbitRef.current;
    if (viewMode === 'top') {
      camera.position.set(0, 12, 0.01);
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    } else {
      camera.position.set(5.5, 5.5, 6.5);
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }
  }, [viewMode, camera, orbitRef]);

  return null;
}

export function Viewport3D({
  room,
  viewMode = '3d',
  selectedWallId = null,
  onSelectWall,
  isDrawingWalls = false,
  draftPoints = [],
  hoverPoint = null,
  onHoverPointChange,
  onFloorDrawClick,
  sceneObjects,
  models,
  selectedInstanceId,
  transformTool,
  onSelectObject,
  onTransformChange,
}: Viewport3DProps) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [isDraggingObject, setIsDraggingObject] = useState(false);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [5.5, 5.5, 6.5], fov: 45, near: 0.1, far: 150 }}
      onPointerMissed={() => {
        if (!isDrawingWalls) {
          onSelectObject(null);
          onSelectWall?.(null);
        }
      }}
    >
      <color attach="background" args={['#0b1120']} />

      <CameraModeController viewMode={viewMode} orbitRef={orbitRef} />

      <ambientLight intensity={0.65} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={35}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
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
        args={[30, 30]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1e293b"
        sectionSize={1}
        sectionThickness={1.2}
        sectionColor="#334155"
        fadeDistance={28}
        fadeStrength={1.5}
        position={[0, 0, 0]}
      />

      <RoomMesh
        room={room}
        selectedWallId={selectedWallId}
        onSelectWall={onSelectWall}
        isDrawingWalls={isDrawingWalls}
        draftPoints={draftPoints}
        hoverPoint={hoverPoint}
        onHoverPointChange={onHoverPointChange}
        onFloorDrawClick={onFloorDrawClick}
      />

      {sceneObjects.map((obj) => {
        const model = models.find((m) => m.id === obj.modelId);
        if (!model) return null;

        return (
          <SceneItemMesh
            key={obj.instanceId}
            item={obj}
            model={model}
            isSelected={!isDrawingWalls && obj.instanceId === selectedInstanceId}
            transformTool={transformTool}
            onSelect={(id) => {
              if (!isDrawingWalls) {
                onSelectObject(id);
                onSelectWall?.(null);
              }
            }}
            onTransformChange={onTransformChange}
            onDraggingChange={setIsDraggingObject}
          />
        );
      })}

      <OrbitControls
        ref={orbitRef}
        makeDefault
        enabled={!isDraggingObject}
        enableDamping
        dampingFactor={0.08}
        enableRotate={viewMode !== 'top'}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={1.2}
        maxDistance={32}
      />
    </Canvas>
  );
}