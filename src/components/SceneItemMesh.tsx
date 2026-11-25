import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { WALL_SNAP_CATEGORIES } from '../types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  SceneObject,
  TransformTool,
} from '../types/editor';
import type { WallSegment } from '../types/room';
import { loadGlbFromUrl } from '../utils/gltfLoader';
import { snapFurnitureToWalls } from '../utils/furnitureSnap';

export interface DiscoveredMaterialSlot {
  key: string;
  label: string;
  defaultColorHex: string;
}

interface OriginalMaterialBackup {
  colorHex: string;
  map: THREE.Texture | null;
  roughness: number;
  metalness: number;
}

type MaterialSlotMap = Map<string, THREE.MeshStandardMaterial[]>;
type MaterialBackupMap = Map<string, OriginalMaterialBackup>;

interface SceneItemMeshProps {
  item: SceneObject;
  model: CatalogModel;
  textures?: CatalogTexture[];
  walls?: WallSegment[];
  isSelected: boolean;
  transformTool: TransformTool;
  onSelect: (instanceId: string) => void;
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
  onDraggingChange: (isDragging: boolean) => void;
}

const itemTextureCache = new Map<string, THREE.Texture>();

function getOrLoadItemTexture(url: string): Promise<THREE.Texture | null> {
  const cached = itemTextureCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
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
        itemTextureCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

export function SceneItemMesh({
  item,
  model,
  textures = [],
  walls = [],
  isSelected,
  transformTool,
  onSelect,
  onMaterialsDiscovered,
  onTransformChange,
  onDraggingChange,
}: SceneItemMeshProps) {
  const [groupObj, setGroupObj] = useState<THREE.Group | null>(null);
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState(false);

  const materialsByKeyRef = useRef<MaterialSlotMap>(new Map());
  const originalBackupRef = useRef<MaterialBackupMap>(new Map());

  const targetW = Math.max(0.01, model.dimensionsCm.width / 100);
  const targetH = Math.max(0.01, model.dimensionsCm.height / 100);
  const targetD = Math.max(0.01, model.dimensionsCm.depth / 100);

  const canSnapToWall = WALL_SNAP_CATEGORIES.includes(model.category);

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

        const matMap: MaterialSlotMap = new Map();
        const backupMap: MaterialBackupMap = new Map();
        const discoveredSlots: DiscoveredMaterialSlot[] = [];

        let unnamedCounter = 1;

        rawScene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;

          mesh.castShadow = true;
          mesh.receiveShadow = true;

          const origMats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];

          const clonedMats = origMats.map((m) => {
            const cloned = m.clone() as THREE.MeshStandardMaterial;
            const rawName = (cloned.name || mesh.name || '').trim();
            const key = rawName || `part_${unnamedCounter++}`;
            const label =
              rawName && !rawName.startsWith('Material_')
                ? rawName
                : `Част ${discoveredSlots.length + 1}`;

            if (!matMap.has(key)) {
              matMap.set(key, []);
              const colorHex = cloned.color
                ? `#${cloned.color.getHexString()}`
                : '#cccccc';
              backupMap.set(key, {
                colorHex,
                map: cloned.map ?? null,
                roughness:
                  typeof cloned.roughness === 'number' ? cloned.roughness : 0.6,
                metalness:
                  typeof cloned.metalness === 'number' ? cloned.metalness : 0.05,
              });
              discoveredSlots.push({
                key,
                label,
                defaultColorHex: colorHex,
              });
            }

            matMap.get(key)!.push(cloned);
            return cloned;
          });

          mesh.material = Array.isArray(mesh.material)
            ? clonedMats
            : clonedMats[0];
        });

        materialsByKeyRef.current = matMap;
        originalBackupRef.current = backupMap;

        const wrapper = new THREE.Group();
        rawScene.scale.set(scaleX, scaleY, scaleZ);
        rawScene.position.set(
          -center.x * scaleX,
          -box.min.y * scaleY,
          -center.z * scaleZ
        );

        wrapper.add(rawScene);
        setLoadedScene(wrapper);

        if (onMaterialsDiscovered) {
          onMaterialsDiscovered(item.instanceId, discoveredSlots);
        }
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

  // Прилагане на сменените цветове / PBR текстури по частите на модела
  useEffect(() => {
    if (!loadedScene) return;
    let cancelled = false;

    const overrides = item.materialOverrides ?? {};
    const matMap = materialsByKeyRef.current;
    const backupMap = originalBackupRef.current;

    matMap.forEach((mats, key) => {
      const ov = overrides[key];
      const backup = backupMap.get(key);
      if (!backup) return;

      const texMeta = ov?.textureId
        ? textures.find((t) => t.id === ov.textureId) ?? null
        : null;

      if (texMeta) {
        getOrLoadItemTexture(texMeta.mapUrl).then((baseTex) => {
          if (cancelled || !baseTex) return;
          const texClone = baseTex.clone();
          texClone.wrapS = THREE.RepeatWrapping;
          texClone.wrapT = THREE.RepeatWrapping;
          const repX = Math.max(0.25, 1 / Math.max(0.05, texMeta.tileWidthM));
          const repY = Math.max(0.25, 1 / Math.max(0.05, texMeta.tileHeightM));
          texClone.repeat.set(repX, repY);
          texClone.needsUpdate = true;

          for (const mat of mats) {
            mat.map = texClone;
            mat.color.set(ov?.color || '#ffffff');
            mat.roughness = ov?.roughness ?? texMeta.roughness ?? backup.roughness;
            mat.metalness = ov?.metalness ?? texMeta.metalness ?? backup.metalness;
            mat.needsUpdate = true;
          }
        });
      } else {
        for (const mat of mats) {
          mat.map = ov?.color ? null : backup.map;
          mat.color.set(ov?.color || backup.colorHex);
          mat.roughness = backup.roughness;
          mat.metalness = backup.metalness;
          mat.needsUpdate = true;
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadedScene, item.materialOverrides, textures]);

  // Синхронизиране на трансформацията от състоянието към 3D групата
  useEffect(() => {
    if (!groupObj) return;
    const mirrorSign = item.mirrored ? -1 : 1;
    groupObj.position.set(item.position[0], item.position[1], item.position[2]);
    groupObj.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    groupObj.scale.set(
      Math.abs(item.scale[0]) * mirrorSign,
      item.scale[1],
      item.scale[2]
    );
  }, [groupObj, item.position, item.rotation, item.scale, item.mirrored]);

  function clampObjectTransform() {
    if (!groupObj) return;
    const mirrorSign = item.mirrored ? -1 : 1;

    if (groupObj.position.y < 0) {
      groupObj.position.y = 0;
    }

    const absSx = Math.abs(groupObj.scale.x);

    if (model.scaleMode === 'fixed') {
      groupObj.scale.set(1 * mirrorSign, 1, 1);
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
        ? Math.min(maxSx, Math.max(minSx, absSx))
        : 1;
      const sy = model.scaleConstraints.allowY
        ? Math.min(maxSy, Math.max(minSy, groupObj.scale.y))
        : 1;
      const sz = model.scaleConstraints.allowZ
        ? Math.min(maxSz, Math.max(minSz, groupObj.scale.z))
        : 1;

      groupObj.scale.set(sx * mirrorSign, sy, sz);
    } else {
      groupObj.scale.set(
        Math.min(20, Math.max(0.05, absSx)) * mirrorSign,
        Math.min(20, Math.max(0.05, groupObj.scale.y)),
        Math.min(20, Math.max(0.05, groupObj.scale.z))
      );
    }

    // Магнитно снапване към стените само за разрешените категории (гардероби, кухни, декор и др.)
    if (canSnapToWall && transformTool === 'translate' && walls.length > 0) {
      const currentHalfW = (targetW * Math.abs(groupObj.scale.x)) / 2;
      const currentBackOffset = (targetD * Math.abs(groupObj.scale.z)) / 2;

      const snapped = snapFurnitureToWalls(
        [groupObj.position.x, groupObj.position.y, groupObj.position.z],
        groupObj.rotation.y,
        walls,
        {
          backOffsetM: currentBackOffset,
          halfWidthM: currentHalfW,
          snapDistanceM: 0.3,
        }
      );

      if (snapped.snapped) {
        groupObj.position.x = snapped.position[0];
        groupObj.position.z = snapped.position[2];
        groupObj.rotation.y = snapped.rotationY;
      }
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
      Number(Math.abs(groupObj.scale.x).toFixed(4)),
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