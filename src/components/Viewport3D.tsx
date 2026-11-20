import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, Grid, Lightformer, OrbitControls, TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CatalogModel, SceneObject, TransformTool } from '../types/editor';
import type { RoomConfig } from '../types/room';
import { RoomMesh } from './RoomMesh';
import { SceneItemMesh } from './SceneItemMesh';

interface Viewport3DProps {
  room: RoomConfig;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
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

interface SelectedObjectGizmoProps {
  selectedObject: SceneObject;
  selectedModel: CatalogModel;
  transformTool: TransformTool;
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
}

function SelectedObjectGizmo({
  selectedObject,
  selectedModel,
  transformTool,
  orbitRef,
  onTransformChange,
}: SelectedObjectGizmoProps) {
  const targetRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const group = targetRef.current;
    if (!group) return;
    group.position.set(...selectedObject.position);
    group.rotation.set(...selectedObject.rotation);
    group.scale.set(...selectedObject.scale);
  }, [
    selectedObject.instanceId,
    selectedObject.position,
    selectedObject.rotation,
    selectedObject.scale,
  ]);

  function commitTransform() {
    const group = targetRef.current;
    if (!group) return;

    const clampedY = Math.max(0, group.position.y);
    group.position.y = clampedY;

    let sx = Math.max(0.05, group.scale.x);
    let sy = Math.max(0.05, group.scale.y);
    let sz = Math.max(0.05, group.scale.z);

    if (selectedModel.scaleMode === 'fixed') {
      sx = 1;
      sy = 1;
      sz = 1;
    } else if (selectedModel.scaleMode === 'constrained') {
      const { allowX, allowY, allowZ, minCm, maxCm } = selectedModel.scaleConstraints;
      const baseW = Math.max(1, selectedModel.dimensionsCm.width);
      const baseH = Math.max(1, selectedModel.dimensionsCm.height);
      const baseD = Math.max(1, selectedModel.dimensionsCm.depth);

      if (!allowX) {
        sx = 1;
      } else {
        const minSx = minCm.width / baseW;
        const maxSx = maxCm.width / baseW;
        sx = Math.min(maxSx, Math.max(minSx, sx));
      }

      if (!allowY) {
        sy = 1;
      } else {
        const minSy = minCm.height / baseH;
        const maxSy = maxCm.height / baseH;
        sy = Math.min(maxSy, Math.max(minSy, sy));
      }

      if (!allowZ) {
        sz = 1;
      } else {
        const minSz = minCm.depth / baseD;
        const maxSz = maxCm.depth / baseD;
        sz = Math.min(maxSz, Math.max(minSz, sz));
      }
    }

    group.scale.set(sx, sy, sz);

    onTransformChange(
      selectedObject.instanceId,
      [
        Number(group.position.x.toFixed(3)),
        Number(clampedY.toFixed(3)),
        Number(group.position.z.toFixed(3)),
      ],
      [
        Number(group.rotation.x.toFixed(4)),
        Number(group.rotation.y.toFixed(4)),
        Number(group.rotation.z.toFixed(4)),
      ],
      [Number(sx.toFixed(3)), Number(sy.toFixed(3)), Number(sz.toFixed(3))]
    );
  }

  const showScale =
    transformTool !== 'scale' || selectedModel.scaleMode !== 'fixed';
  const effectiveMode: 'translate' | 'rotate' | 'scale' =
    transformTool === 'scale' && !showScale ? 'translate' : transformTool;

  return (
    <>
      <group
        ref={targetRef}
        position={selectedObject.position}
        rotation={selectedObject.rotation}
        scale={selectedObject.scale}
      />
      {targetRef.current && (
        <TransformControls
          object={targetRef.current}
          mode={effectiveMode}
          size={0.75}
          showX={
            effectiveMode === 'scale'
              ? selectedModel.scaleMode === 'free' ||
                (selectedModel.scaleMode === 'constrained' &&
                  selectedModel.scaleConstraints.allowX)
              : true
          }
          showY={
            effectiveMode === 'scale'
              ? selectedModel.scaleMode === 'free' ||
                (selectedModel.scaleMode === 'constrained' &&
                  selectedModel.scaleConstraints.allowY)
              : true
          }
          showZ={
            effectiveMode === 'scale'
              ? selectedModel.scaleMode === 'free' ||
                (selectedModel.scaleMode === 'constrained' &&
                  selectedModel.scaleConstraints.allowZ)
              : true
          }
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            commitTransform();
          }}
          onObjectChange={() => {
            if (effectiveMode === 'translate' && targetRef.current) {
              if (targetRef.current.position.y < 0) {
                targetRef.current.position.y = 0;
              }
            }
          }}
        />
      )}
    </>
  );
}

export function Viewport3D({
  room,
  selectedWallId = null,
  onSelectWall,
  isDrawingWalls = false,
  draftPoints = [],
  onFloorDrawClick,
  sceneObjects,
  models,
  selectedInstanceId,
  transformTool,
  onSelectObject,
  onTransformChange,
}: Viewport3DProps) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

  const selectedObject =
    sceneObjects.find((obj) => obj.instanceId === selectedInstanceId) ?? null;
  const selectedModel = selectedObject
    ? models.find((m) => m.id === selectedObject.modelId) ?? null
    : null;

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

      <ambientLight intensity={0.65} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={35}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
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
        fadeDistance={26}
        fadeStrength={1.5}
        position={[0, 0, 0]}
      />

      <RoomMesh
        room={room}
        selectedWallId={selectedWallId}
        onSelectWall={onSelectWall}
        isDrawingWalls={isDrawingWalls}
        draftPoints={draftPoints}
        onFloorDrawClick={onFloorDrawClick}
      />

      {sceneObjects.map((obj) => {
        const model = models.find((m) => m.id === obj.modelId);
        if (!model) return null;

        return (
          <SceneItemMesh
            key={obj.instanceId}
            sceneObject={obj}
            model={model}
            isSelected={obj.instanceId === selectedInstanceId}
            onSelect={(id) => {
              if (!isDrawingWalls) {
                onSelectObject(id);
                onSelectWall?.(null);
              }
            }}
          />
        );
      })}

      {!isDrawingWalls && selectedObject && selectedModel && (
        <SelectedObjectGizmo
          selectedObject={selectedObject}
          selectedModel={selectedModel}
          transformTool={transformTool}
          orbitRef={orbitRef}
          onTransformChange={onTransformChange}
        />
      )}

      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={1.2}
        maxDistance={28}
      />
    </Canvas>
  );
}