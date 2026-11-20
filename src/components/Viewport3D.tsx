import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { TestApartment } from './TestApartment';
import { SceneItemMesh } from './SceneItemMesh';
import type {
  CatalogModel,
  SceneObject,
  TransformTool,
} from '../types/editor';

interface Viewport3DProps {
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
  sceneObjects,
  models,
  selectedInstanceId,
  transformTool,
  onSelectObject,
  onTransformChange,
}: Viewport3DProps) {
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', background: '#111827' }}>
      <Canvas
        shadows
        camera={{ position: [6.5, 6.0, 7.5], fov: 45, near: 0.05, far: 100 }}
        onPointerMissed={() => onSelectObject(null)}
      >
        <color attach="background" args={['#111827']} />

        {/* Базово студийно осветление (Dome + Key Light) */}
        <hemisphereLight args={['#ffffff', '#334155', 0.95]} />
        <directionalLight
          position={[6, 12, 8]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.0005}
        />

        {/* Тестов многостаен апартамент */}
        <TestApartment />

        {/* Поставени мебели и 3D обекти в сцената */}
        {sceneObjects.map((item) => {
          const model = models.find((m) => m.id === item.modelId);
          if (!model) return null;

          return (
            <SceneItemMesh
              key={item.instanceId}
              item={item}
              model={model}
              isSelected={item.instanceId === selectedInstanceId}
              transformTool={transformTool}
              onSelect={(id) => onSelectObject(id)}
              onTransformChange={onTransformChange}
              onDraggingChange={setIsDraggingGizmo}
            />
          );
        })}

        {/* Координатна мрежа: 1 голям квадрат = 1 метър, 1 малко квадратче = 10 см */}
        <Grid
          args={[20, 20]}
          position={[0, -0.001, 0]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={25}
          infiniteGrid
        />

        {/* Оси в началото на координатната система (0,0,0): X=червено, Y=зелено, Z=синьо */}
        <axesHelper args={[1]} />

        {/* Навигация на камерата (блокира се автоматично при влачене на Gizmo) */}
        <OrbitControls
          makeDefault
          enabled={!isDraggingGizmo}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2 - 0.02}
          target={[0, 0.5, 0]}
        />
      </Canvas>
    </div>
  );
}