import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type {
  CatalogModel,
  SceneObject,
  TransformTool,
} from '../types/editor';
import { loadGlbFromUrl } from '../utils/gltfLoader';

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

export function SceneItemMesh({
  item,
  model,
  isSelected,
  transformTool,
  onSelect,
  onTransformChange,
  onDraggingChange,
}: SceneItemMeshProps) {
  const [groupObj, setGroupObj] = useState<THREE.Group | null>(null);
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState(false);

  const targetW = Math.max(0.01, model.dimensionsCm.width / 100);
  const targetH = Math.max(0.01, model.dimensionsCm.height / 100);
  const targetD = Math.max(0.01, model.dimensionsCm.depth / 100);

  // Зареждане на .glb файла от сървъра и приравняване към базовите размери на кота Y = 0
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      if (!model.glbUrl) {
        setLoadedScene(null);
        setLoadError(false);
        return;
      }

      try {
        setLoadError(false);
        const rawScene = await loadGlbFromUrl(model.glbUrl);
        if (cancelled) return;

        rawScene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rawScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const scaleX = size.x > 0.0001 ? targetW / size.x : 1;
        const scaleY = size.y > 0.0001 ? targetH / size.y : 1;
        const scaleZ = size.z > 0.0001 ? targetD / size.z : 1;

        const wrapper = new THREE.Group();
        rawScene.scale.set(scaleX, scaleY, scaleZ);
        rawScene.position.set(
          -center.x * scaleX,
          -box.min.y * scaleY,
          -center.z * scaleZ
        );

        rawScene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        wrapper.add(rawScene);
        setLoadedScene(wrapper);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoadedScene(null);
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [model.glbUrl, targetW, targetH, targetD]);

  // Синхронизиране на трансформацията от състоянието към 3D групата
  useEffect(() => {
    if (!groupObj) return;
    groupObj.position.set(item.position[0], item.position[1], item.position[2]);
    groupObj.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    groupObj.scale.set(item.scale[0], item.scale[1], item.scale[2]);
  }, [groupObj, item.position, item.rotation, item.scale]);

  function clampObjectTransform() {
    if (!groupObj) return;

    // Не позволяваме обектът да потъва под пода (Y = 0)
    if (groupObj.position.y < 0) {
      groupObj.position.y = 0;
    }

    // Прилагане на правилата за мащабиране на модела
    if (model.scaleMode === 'fixed') {
      groupObj.scale.set(1, 1, 1);
    } else if (model.scaleMode === 'constrained') {
      const baseW = Math.max(1, model.dimensionsCm.width);
      const baseH = Math.max(1, model.dimensionsCm.height);
      const baseD = Math.max(1, model.dimensionsCm.depth);

      const minSx = Math.max(0.05, model.scaleConstraints.minCm.width / baseW);
      const maxSx = Math.max(minSx, model.scaleConstraints.maxCm.width / baseW);
      const minSy = Math.max(0.05, model.scaleConstraints.minCm.height / baseH);
      const maxSy = Math.max(minSy, model.scaleConstraints.maxCm.height / baseH);
      const minSz = Math.max(0.05, model.scaleConstraints.minCm.depth / baseD);
      const maxSz = Math.max(minSz, model.scaleConstraints.maxCm.depth / baseD);

      const sx = model.scaleConstraints.allowX
        ? Math.min(maxSx, Math.max(minSx, groupObj.scale.x))
        : 1;
      const sy = model.scaleConstraints.allowY
        ? Math.min(maxSy, Math.max(minSy, groupObj.scale.y))
        : 1;
      const sz = model.scaleConstraints.allowZ
        ? Math.min(maxSz, Math.max(minSz, groupObj.scale.z))
        : 1;

      groupObj.scale.set(sx, sy, sz);
    } else {
      groupObj.scale.set(
        Math.min(20, Math.max(0.05, groupObj.scale.x)),
        Math.min(20, Math.max(0.05, groupObj.scale.y)),
        Math.min(20, Math.max(0.05, groupObj.scale.z))
      );
    }
  }

  function commitTransform() {
    if (!groupObj) return;
    clampObjectTransform();

    const nextPos: [number, number, number] = [
      Number(groupObj.position.x.toFixed(4)),
      Number(groupObj.position.y.toFixed(4)),
      Number(groupObj.position.z.toFixed(4)),
    ];
    const nextRot: [number, number, number] = [
      Number(groupObj.rotation.x.toFixed(4)),
      Number(groupObj.rotation.y.toFixed(4)),
      Number(groupObj.rotation.z.toFixed(4)),
    ];
    const nextScale: [number, number, number] = [
      Number(groupObj.scale.x.toFixed(4)),
      Number(groupObj.scale.y.toFixed(4)),
      Number(groupObj.scale.z.toFixed(4)),
    ];

    onTransformChange(item.instanceId, nextPos, nextRot, nextScale);
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    onSelect(item.instanceId);
  }

  return (
    <>
      <group ref={setGroupObj} onClick={handleClick}>
        {loadedScene ? (
          <primitive object={loadedScene} />
        ) : (
          <mesh position={[0, targetH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[targetW, targetH, targetD]} />
            <meshStandardMaterial
              color={loadError ? '#ef4444' : '#3b82f6'}
              roughness={0.65}
              metalness={0.1}
            />
          </mesh>
        )}

        {isSelected && (
          <mesh position={[0, targetH / 2, 0]}>
            <boxGeometry args={[targetW + 0.015, targetH + 0.015, targetD + 0.015]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.55} />
          </mesh>
        )}
      </group>

      {isSelected && groupObj && (
        <TransformControls
          object={groupObj}
          mode={transformTool}
          onMouseDown={() => onDraggingChange(true)}
          onMouseUp={() => {
            onDraggingChange(false);
            commitTransform();
          }}
          onObjectChange={clampObjectTransform}
        />
      )}
    </>
  );
}