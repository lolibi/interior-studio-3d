import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Grid,
  OrbitControls,
  TransformControls,
  useGLTF,
  useTexture,
} from '@react-three/drei';
import * as THREE from 'three';
import type {
  CatalogTexture,
  EditorTool,
  PlacementMode,
  PlacedObject,
  RoomConfig,
} from '../types/editor';

export interface SceneCanvasProps {
  objects: PlacedObject[];
  selectedId: string | null;
  room: RoomConfig;
  textures: CatalogTexture[];
  activeTool: EditorTool;
  placementMode: PlacementMode;
  snapEnabled: boolean;
  wallSnapCategories: Set<string>;
  onSelectObject: (id: string | null) => void;
  onUpdateObject: (id: string, patch: Partial<PlacedObject>) => void;
}

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface RoomMeshProps {
  room: RoomConfig;
  onDeselect: () => void;
}

const RoomMesh: React.FC<RoomMeshProps> = ({ room, onDeselect }) => {
  const floorTex = useTexture(room.floorTextureUrl || TRANSPARENT_PIXEL);
  const wallTex = useTexture(room.wallTextureUrl || TRANSPARENT_PIXEL);

  useEffect(() => {
    if (room.floorTextureUrl && floorTex) {
      floorTex.wrapS = THREE.RepeatWrapping;
      floorTex.wrapT = THREE.RepeatWrapping;
      const repX = Math.max(1, room.widthM / (room.floorTileWidthM || 0.6));
      const repY = Math.max(1, room.depthM / (room.floorTileHeightM || 0.6));
      floorTex.repeat.set(repX, repY);
      floorTex.needsUpdate = true;
    }
  }, [
    floorTex,
    room.floorTextureUrl,
    room.widthM,
    room.depthM,
    room.floorTileWidthM,
    room.floorTileHeightM,
  ]);

  useEffect(() => {
    if (room.wallTextureUrl && wallTex) {
      wallTex.wrapS = THREE.RepeatWrapping;
      wallTex.wrapT = THREE.RepeatWrapping;
      const repX = Math.max(1, room.widthM / (room.wallTileWidthM || 0.6));
      const repY = Math.max(1, room.heightM / (room.wallTileHeightM || 0.6));
      wallTex.repeat.set(repX, repY);
      wallTex.needsUpdate = true;
    }
  }, [
    wallTex,
    room.wallTextureUrl,
    room.widthM,
    room.heightM,
    room.wallTileWidthM,
    room.wallTileHeightM,
  ]);

  const wallThickness = 0.12;

  return (
    <group>
      {/* Под */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onDeselect();
        }}
      >
        <planeGeometry args={[room.widthM, room.depthM]} />
        <meshStandardMaterial
          color={room.floorTextureUrl ? '#ffffff' : room.floorColor}
          map={room.floorTextureUrl ? floorTex : null}
          roughness={0.65}
          metalness={0.05}
        />
      </mesh>

      {/* Задна стена (-Z) */}
      <mesh
        position={[
          0,
          room.heightM / 2,
          -room.depthM / 2 - wallThickness / 2,
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry
          args={[room.widthM + wallThickness * 2, room.heightM, wallThickness]}
        />
        <meshStandardMaterial
          color={room.wallTextureUrl ? '#ffffff' : room.wallColor}
          map={room.wallTextureUrl ? wallTex : null}
          roughness={0.85}
        />
      </mesh>

      {/* Лява стена (-X) */}
      <mesh
        position={[
          -room.widthM / 2 - wallThickness / 2,
          room.heightM / 2,
          0,
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[wallThickness, room.heightM, room.depthM]} />
        <meshStandardMaterial
          color={room.wallTextureUrl ? '#ffffff' : room.wallColor}
          map={room.wallTextureUrl ? wallTex : null}
          roughness={0.85}
        />
      </mesh>

      {/* Дясна стена (+X) */}
      <mesh
        position={[
          room.widthM / 2 + wallThickness / 2,
          room.heightM / 2,
          0,
        ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[wallThickness, room.heightM, room.depthM]} />
        <meshStandardMaterial
          color={room.wallTextureUrl ? '#ffffff' : room.wallColor}
          map={room.wallTextureUrl ? wallTex : null}
          roughness={0.85}
        />
      </mesh>
    </group>
  );
};

interface GlbModelContentProps {
  glbUrl: string;
  targetDimensionsM: [number, number, number];
  colorOverride?: string;
  texture?: CatalogTexture;
}

const GlbModelContent: React.FC<GlbModelContentProps> = ({
  glbUrl,
  targetDimensionsM,
  colorOverride,
  texture,
}) => {
  const { scene } = useGLTF(glbUrl);
  const overrideTex = useTexture(texture?.mapUrl || TRANSPARENT_PIXEL);

  const normalizedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const sx = size.x > 0.0001 ? targetDimensionsM[0] / size.x : 1;
    const sy = size.y > 0.0001 ? targetDimensionsM[1] / size.y : 1;
    const sz = size.z > 0.0001 ? targetDimensionsM[2] / size.z : 1;

    clone.scale.set(sx, sy, sz);
    clone.position.set(
      -center.x * sx,
      -box.min.y * sy,
      -center.z * sz
    );

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (colorOverride || texture?.mapUrl) {
          const baseMat = Array.isArray(mesh.material)
            ? mesh.material[0]
            : mesh.material;
          const clonedMat = baseMat
            ? baseMat.clone()
            : new THREE.MeshStandardMaterial();
          if (clonedMat instanceof THREE.MeshStandardMaterial) {
            if (texture?.mapUrl) {
              overrideTex.wrapS = THREE.RepeatWrapping;
              overrideTex.wrapT = THREE.RepeatWrapping;
              overrideTex.needsUpdate = true;
              clonedMat.map = overrideTex;
              clonedMat.color.set('#ffffff');
              if (typeof texture.roughness === 'number') {
                clonedMat.roughness = texture.roughness;
              }
              if (typeof texture.metalness === 'number') {
                clonedMat.metalness = texture.metalness;
              }
            } else if (colorOverride) {
              clonedMat.map = null;
              clonedMat.color.set(colorOverride);
            }
            clonedMat.needsUpdate = true;
          }
          mesh.material = clonedMat;
        }
      }
    });

    return clone;
  }, [scene, targetDimensionsM, colorOverride, texture, overrideTex]);

  return <primitive object={normalizedScene} />;
};

interface PlaceholderBoxContentProps {
  dimensionsM: [number, number, number];
  isSelected: boolean;
  colorOverride?: string;
  texture?: CatalogTexture;
}

const PlaceholderBoxContent: React.FC<PlaceholderBoxContentProps> = ({
  dimensionsM,
  isSelected,
  colorOverride,
  texture,
}) => {
  const tex = useTexture(texture?.mapUrl || TRANSPARENT_PIXEL);

  useEffect(() => {
    if (texture?.mapUrl && tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
    }
  }, [tex, texture?.mapUrl]);

  return (
    <mesh
      position={[0, dimensionsM[1] / 2, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={dimensionsM} />
      <meshStandardMaterial
        color={
          texture?.mapUrl
            ? '#ffffff'
            : colorOverride || (isSelected ? '#38bdf8' : '#64748b')
        }
        map={texture?.mapUrl ? tex : null}
        roughness={texture?.roughness ?? 0.55}
        metalness={texture?.metalness ?? 0.1}
      />
    </mesh>
  );
};

interface SceneItemProps {
  item: PlacedObject;
  isSelected: boolean;
  room: RoomConfig;
  textures: CatalogTexture[];
  activeTool: EditorTool;
  placementMode: PlacementMode;
  snapEnabled: boolean;
  wallSnapCategories: Set<string>;
  onSelect: () => void;
  onUpdate: (patch: Partial<PlacedObject>) => void;
  onDraggingChange: (dragging: boolean) => void;
}

const SceneItem: React.FC<SceneItemProps> = ({
  item,
  isSelected,
  room,
  textures,
  activeTool,
  placementMode,
  snapEnabled,
  wallSnapCategories,
  onSelect,
  onUpdate,
  onDraggingChange,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  const dimsM = useMemo<[number, number, number]>(
    () => [
      Math.max(0.05, (item.dimensionsCm.width || 100) / 100),
      Math.max(0.05, (item.dimensionsCm.height || 100) / 100),
      Math.max(0.05, (item.dimensionsCm.depth || 100) / 100),
    ],
    [item.dimensionsCm.width, item.dimensionsCm.height, item.dimensionsCm.depth]
  );

  const appliedTexture = useMemo(
    () =>
      item.textureOverrideId
        ? textures.find((t) => t.id === item.textureOverrideId)
        : undefined,
    [item.textureOverrideId, textures]
  );

  const transformMode: 'translate' | 'rotate' | 'scale' =
    activeTool === 'rotate'
      ? 'rotate'
      : activeTool === 'scale'
        ? 'scale'
        : 'translate';

  const handleTransformEnd = () => {
    onDraggingChange(false);
    const g = groupRef.current;
    if (!g) return;

    let nextX = g.position.x;
    let nextY = Math.max(0, g.position.y);
    let nextZ = g.position.z;

    const scaledW = dimsM[0] * g.scale.x;
    const scaledD = dimsM[2] * g.scale.z;

    if (snapEnabled && placementMode === 'grid') {
      nextX = Math.round(nextX / 0.1) * 0.1;
      nextZ = Math.round(nextZ / 0.1) * 0.1;
    }

    const shouldSnapWall =
      snapEnabled &&
      (placementMode === 'wall' || wallSnapCategories.has(item.category));

    if (shouldSnapWall) {
      const backZ = -room.depthM / 2 + scaledD / 2;
      const leftX = -room.widthM / 2 + scaledW / 2;
      const rightX = room.widthM / 2 - scaledW / 2;
      if (Math.abs(nextZ - backZ) < 0.35) nextZ = backZ;
      if (Math.abs(nextX - leftX) < 0.35) nextX = leftX;
      if (Math.abs(nextX - rightX) < 0.35) nextX = rightX;
    }

    const halfW = room.widthM / 2 - scaledW / 2;
    const halfD = room.depthM / 2 - scaledD / 2;
    if (halfW > 0) nextX = Math.max(-halfW, Math.min(halfW, nextX));
    if (halfD > 0) nextZ = Math.max(-halfD, Math.min(halfD, nextZ));

    g.position.set(nextX, nextY, nextZ);

    onUpdate({
      position: [
        Number(nextX.toFixed(3)),
        Number(nextY.toFixed(3)),
        Number(nextZ.toFixed(3)),
      ],
      rotation: [
        Number(g.rotation.x.toFixed(4)),
        Number(g.rotation.y.toFixed(4)),
        Number(g.rotation.z.toFixed(4)),
      ],
      scale: [
        Number(Math.max(0.1, g.scale.x).toFixed(4)),
        Number(Math.max(0.1, g.scale.y).toFixed(4)),
        Number(Math.max(0.1, g.scale.z).toFixed(4)),
      ],
    });
  };

  return (
    <>
      <group
        ref={groupRef}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {item.glbUrl ? (
          <GlbModelContent
            glbUrl={item.glbUrl}
            targetDimensionsM={dimsM}
            colorOverride={item.colorOverride}
            texture={appliedTexture}
          />
        ) : (
          <PlaceholderBoxContent
            dimensionsM={dimsM}
            isSelected={isSelected}
            colorOverride={item.colorOverride}
            texture={appliedTexture}
          />
        )}

        {isSelected && (
          <mesh position={[0, dimsM[1] / 2, 0]}>
            <boxGeometry
              args={[dimsM[0] + 0.03, dimsM[1] + 0.03, dimsM[2] + 0.03]}
            />
            <meshBasicMaterial color="#38bdf8" wireframe />
          </mesh>
        )}
      </group>

      {isSelected && groupRef.current && activeTool !== 'select' && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          translationSnap={snapEnabled && placementMode === 'grid' ? 0.1 : null}
          rotationSnap={snapEnabled ? Math.PI / 12 : null}
          onMouseDown={() => onDraggingChange(true)}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
  );
};

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  objects,
  selectedId,
  room,
  textures,
  activeTool,
  placementMode,
  snapEnabled,
  wallSnapCategories,
  onSelectObject,
  onUpdateObject,
}) => {
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [4.2, 3.6, 5.2], fov: 45, near: 0.1, far: 100 }}
        onPointerMissed={() => onSelectObject(null)}
      >
        <color attach="background" args={['#020617']} />

        <ambientLight intensity={0.65} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-4, 5, -3]} intensity={0.35} />

        <RoomMesh room={room} onDeselect={() => onSelectObject(null)} />

        <Grid
          position={[0, 0.002, 0]}
          args={[room.widthM, room.depthM]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#334155"
          sectionSize={1}
          sectionThickness={1.2}
          sectionColor="#475569"
          fadeDistance={25}
          infiniteGrid={false}
        />

        {objects.map((obj) => (
          <SceneItem
            key={obj.id}
            item={obj}
            isSelected={obj.id === selectedId}
            room={room}
            textures={textures}
            activeTool={activeTool}
            placementMode={placementMode}
            snapEnabled={snapEnabled}
            wallSnapCategories={wallSnapCategories}
            onSelect={() => onSelectObject(obj.id)}
            onUpdate={(patch) => onUpdateObject(obj.id, patch)}
            onDraggingChange={setIsDraggingGizmo}
          />
        ))}

        <OrbitControls
          makeDefault
          enabled={!isDraggingGizmo}
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={1}
          maxDistance={25}
        />
      </Canvas>
    </div>
  );
};

export default SceneCanvas;