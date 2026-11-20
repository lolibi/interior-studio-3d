import { useEffect, useMemo, useState } from 'react';
import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { TransformControls } from '@react-three/drei';
import { getGlbFileUrl } from '../utils/modelStorage';
import { createConfiguredGLTFLoader } from '../utils/gltfLoader';
import type {
  CatalogModel,
  ModelCategory,
  SceneObject,
  TransformTool,
} from '../types/editor';

interface SceneItemMeshProps {
  item: SceneObject;
  model: CatalogModel;
  isSelected: boolean;
  transformTool: TransformTool;
  onSelect: (instanceId: string) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
  onDraggingChange: (isDragging: boolean) => void;
}

const CATEGORY_COLORS: Record<ModelCategory, string> = {
  sofas: '#6366f1',
  armchairs: '#8b5cf6',
  chairs: '#ec4899',
  tables: '#d97706',
  beds: '#0ea5e9',
  wardrobes: '#10b981',
  kitchen: '#14b8a6',
  lighting: '#eab308',
  bathroom: '#38bdf8',
};

interface NormalizedGlbData {
  scene: Object3D;
  normScale: [number, number, number];
  normOffset: [number, number, number];
}

export function SceneItemMesh({
  item,
  model,
  isSelected,
  transformTool,
  onSelect,
  onTransformChange,
  onDraggingChange,
}: SceneItemMeshProps) {
  const [targetGroup, setTargetGroup] = useState<Group | null>(null);
  const [glbData, setGlbData] = useState<NormalizedGlbData | null>(null);

  const targetWidthM = model.dimensionsCm.width / 100;
  const targetHeightM = model.dimensionsCm.height / 100;
  const targetDepthM = model.dimensionsCm.depth / 100;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadModelGeometry() {
      if (!model.glbStorageKey) {
        setGlbData(null);
        return;
      }

      try {
        objectUrl = await getGlbFileUrl(model.glbStorageKey);
        if (!objectUrl || cancelled) return;

        const loader = createConfiguredGLTFLoader();
        const gltf = await loader.loadAsync(objectUrl);
        if (cancelled) return;

        gltf.scene.traverse((child) => {
          if (child instanceof Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        gltf.scene.updateMatrixWorld(true);
        const box = new Box3().setFromObject(gltf.scene);
        const size = new Vector3();
        const center = new Vector3();
        box.getSize(size);
        box.getCenter(center);

        const safeSizeX = size.x > 0.0001 ? size.x : 1;
        const safeSizeY = size.y > 0.0001 ? size.y : 1;
        const safeSizeZ = size.z > 0.0001 ? size.z : 1;

        // Автоматично приравняване към базовите размери в метри (решава 3ds Max Scale Factor 100)
        const normScale: [number, number, number] = [
          targetWidthM / safeSizeX,
          targetHeightM / safeSizeY,
          targetDepthM / safeSizeZ,
        ];

        // Центриране по X и Z и поставяне на основата точно на пода (Y = 0)
        const normOffset: [number, number, number] = [
          -center.x,
          -box.min.y,
          -center.z,
        ];

        setGlbData({
          scene: gltf.scene,
          normScale,
          normOffset,
        });
      } catch {
        if (!cancelled) {
          setGlbData(null);
        }
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }

    loadModelGeometry();

    return () => {
      cancelled = true;
    };
  }, [model.glbStorageKey, targetWidthM, targetHeightM, targetDepthM]);

  const axisVisibility = useMemo(() => {
    if (transformTool !== 'scale') {
      return { showX: true, showY: true, showZ: true };
    }
    if (model.scaleMode === 'fixed') {
      return { showX: false, showY: false, showZ: false };
    }
    if (model.scaleMode === 'free') {
      return { showX: true, showY: true, showZ: true };
    }
    return {
      showX: model.scaleConstraints.allowX,
      showY: model.scaleConstraints.allowY,
      showZ: model.scaleConstraints.allowZ,
    };
  }, [transformTool, model.scaleMode, model.scaleConstraints]);

  function clampAxisScale(rawScale: number, axis: 'width' | 'height' | 'depth'): number {
    if (model.scaleMode === 'fixed') return 1;

    const isAllowed =
      model.scaleMode === 'free' ||
      (axis === 'width' && model.scaleConstraints.allowX) ||
      (axis === 'height' && model.scaleConstraints.allowY) ||
      (axis === 'depth' && model.scaleConstraints.allowZ);

    if (!isAllowed) return 1;

    const base = Math.max(1, model.dimensionsCm[axis]);
    const minRatio = Math.max(0.05, model.scaleConstraints.minCm[axis] / base);
    const maxRatio = Math.max(minRatio, model.scaleConstraints.maxCm[axis] / base);

    return Math.min(maxRatio, Math.max(minRatio, rawScale));
  }

  function handleGizmoChange() {
    if (!targetGroup) return;

    const clampedScaleX = clampAxisScale(targetGroup.scale.x, 'width');
    const clampedScaleY = clampAxisScale(targetGroup.scale.y, 'height');
    const clampedScaleZ = clampAxisScale(targetGroup.scale.z, 'depth');

    targetGroup.scale.set(clampedScaleX, clampedScaleY, clampedScaleZ);

    // Не позволяваме обектът да потъва под нивото на пода (Y = 0)
    const safeY = Math.max(0, targetGroup.position.y);
    targetGroup.position.y = safeY;

    onTransformChange(
      item.instanceId,
      [targetGroup.position.x, safeY, targetGroup.position.z],
      [targetGroup.rotation.x, targetGroup.rotation.y, targetGroup.rotation.z],
      [clampedScaleX, clampedScaleY, clampedScaleZ]
    );
  }

  const placeholderColor = CATEGORY_COLORS[model.category] ?? '#64748b';

  return (
    <>
      <group
        ref={setTargetGroup}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(item.instanceId);
        }}
      >
        {glbData ? (
          <group scale={glbData.normScale}>
            <primitive object={glbData.scene} position={glbData.normOffset} />
          </group>
        ) : (
          <mesh position={[0, targetHeightM / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[targetWidthM, targetHeightM, targetDepthM]} />
            <meshStandardMaterial
              color={placeholderColor}
              roughness={0.6}
              emissive={isSelected ? '#1d4ed8' : '#000000'}
              emissiveIntensity={isSelected ? 0.35 : 0}
            />
          </mesh>
        )}

        {/* Светла рамка около основата при избран обект */}
        {isSelected && (
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[
                Math.max(targetWidthM, targetDepthM) * 0.52,
                Math.max(targetWidthM, targetDepthM) * 0.56,
                32,
              ]}
            />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        )}
      </group>

      {isSelected && targetGroup && (
        <TransformControls
          object={targetGroup}
          mode={transformTool}
          showX={axisVisibility.showX}
          showY={axisVisibility.showY}
          showZ={axisVisibility.showZ}
          onMouseDown={() => onDraggingChange(true)}
          onMouseUp={() => onDraggingChange(false)}
          onChange={handleGizmoChange}
        />
      )}
    </>
  );
}