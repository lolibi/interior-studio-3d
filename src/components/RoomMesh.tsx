import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type {
  CatalogModel,
  CatalogTexture,
  TransformTool,
} from '../types/editor';
import {
  findClosedRoomPolygons,
  getWallEndCapColors,
  getWallJointExtensions,
  isSameSurface,
} from '../types/room';
import type {
  CustomUvwSettings,
  FloorZone,
  RoomConfig,
  SelectedFloorVertex,
  SelectedWallVertex,
  StandaloneOpening,
  SurfaceTarget,
  WallOpening,
  WallSegment,
  WallSide,
} from '../types/room';

export interface RoomMeshProps {
  room: RoomConfig;
  models?: CatalogModel[];
  textures: CatalogTexture[];
  transformTool?: TransformTool;
  isTopView?: boolean;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStandaloneOpeningId: string | null;
  selectedFloorZoneId: string | null;
  selectedSurfaces: SurfaceTarget[];
  draggedTextureId: string | null;
  selectedWallVertex: SelectedWallVertex | null;
  selectedFloorVertex?: SelectedFloorVertex | null;
  linkedVertexJoint?: boolean;
  autoStraightenVertices?: boolean;
  onSelectWall: (wallId: string | null) => void;
  onSelectSurface?: (target: SurfaceTarget, additive: boolean) => void;
  onClearSurfaceSelection?: () => void;
  onDropTextureOnSurface?: (target: SurfaceTarget, textureId: string) => void;
  onMaterializeAutoFloorZone?: (
    points: [number, number][],
    options?: { textureId?: string | null; selectZone?: boolean; additive?: boolean }
  ) => string | null;
  onSelectOpening: (wallId: string, openingId: string) => void;
  onSelectStandaloneOpening: (openingId: string | null) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onSelectWallVertex?: (vertex: SelectedWallVertex | null) => void;
  onSelectFloorVertex?: (vertex: SelectedFloorVertex | null) => void;
  onUpdateStandaloneOpening?: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onCommitWallsFromVertex?: (nextWalls: WallSegment[]) => void;
  onCommitFloorZonesFromVertex?: (nextZones: FloorZone[]) => void;
  onDraggingChange?: (dragging: boolean) => void;
  isDrawingWalls?: boolean;
  draftPoints?: [number, number][];
  hoverPoint?: [number, number] | null;
  onHoverPointChange?: (pt: [number, number] | null) => void;
  onFloorDrawClick?: (point: [number, number]) => void;
  isDrawingFloorZone?: boolean;
  zoneDraftPoints?: [number, number][];
  onFloorZoneDrawClick?: (point: [number, number]) => void;
  isCalibratingPlan?: boolean;
  calibPoints?: [number, number][];
  onCalibFloorClick?: (point: [number, number]) => void;
  onStartDragVertex?: (
    wallId: string,
    endKey: 'start' | 'end',
    e: ThreeEvent<PointerEvent>
  ) => void;
  onStartDragStandaloneOpening?: (
    openingId: string,
    e: ThreeEvent<PointerEvent>
  ) => void;
}

interface ResolvedSurfaceMaterial {
  color: string;
  roughness: number;
  metalness: number;
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
}

function usePbrSurfaceMaterial(params: {
  color?: string;
  texture?: CatalogTexture | null;
  surfaceWidthM: number;
  surfaceHeightM: number;
  overrideTileHeightM?: number | null;
  uvw?: CustomUvwSettings;
  defaultRoughness?: number;
  defaultMetalness?: number;
}): ResolvedSurfaceMaterial {
  const {
    color = '#f1f5f9',
    texture,
    surfaceWidthM,
    surfaceHeightM,
    overrideTileHeightM,
    uvw,
    defaultRoughness = 0.85,
    defaultMetalness = 0.02,
  } = params;

  const [loadedMaps, setLoadedMaps] = useState<{
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
  }>({ map: null, normalMap: null, roughnessMap: null });

  useEffect(() => {
    if (!texture?.mapUrl) {
      setLoadedMaps({ map: null, normalMap: null, roughnessMap: null });
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const loadTex = (
      url: string | undefined,
      isColor: boolean
    ): Promise<THREE.Texture | null> => {
      if (!url) return Promise.resolve(null);
      return new Promise((resolve) => {
        loader.load(
          url,
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.anisotropy = 8;
            if (isColor) {
              tex.colorSpace = THREE.SRGBColorSpace;
            }
            tex.needsUpdate = true;
            resolve(tex);
          },
          undefined,
          () => resolve(null)
        );
      });
    };

    Promise.all([
      loadTex(texture.mapUrl, true),
      loadTex(texture.normalUrl, false),
      loadTex(texture.roughnessUrl, false),
    ]).then(([map, normalMap, roughnessMap]) => {
      if (cancelled) {
        map?.dispose();
        normalMap?.dispose();
        roughnessMap?.dispose();
        return;
      }
      setLoadedMaps({ map, normalMap, roughnessMap });
    });

    return () => {
      cancelled = true;
    };
  }, [texture?.mapUrl, texture?.normalUrl, texture?.roughnessUrl]);

  useEffect(() => {
    return () => {
      loadedMaps.map?.dispose();
      loadedMaps.normalMap?.dispose();
      loadedMaps.roughnessMap?.dispose();
    };
  }, [loadedMaps]);

  const configured = useMemo<ResolvedSurfaceMaterial>(() => {
    if (!texture || !loadedMaps.map) {
      return {
        color,
        roughness: defaultRoughness,
        metalness: defaultMetalness,
        map: null,
        normalMap: null,
        roughnessMap: null,
      };
    }

    const baseTileW = Math.max(0.05, texture.tileWidthM || 0.6);
    const baseTileH = Math.max(
      0.05,
      overrideTileHeightM ?? texture.tileHeightM ?? 0.6
    );

    const tileW =
      uvw?.tileWidthCm && uvw.tileWidthCm > 0
        ? uvw.tileWidthCm / 100
        : baseTileW;
    const tileH =
      uvw?.tileHeightCm && uvw.tileHeightCm > 0
        ? uvw.tileHeightCm / 100
        : baseTileH;

    const repeatX = Math.max(0.05, surfaceWidthM / tileW);
    const repeatY = Math.max(0.05, surfaceHeightM / tileH);
    const rotRad = ((uvw?.rotationDeg ?? 0) * Math.PI) / 180;
    const offX = (uvw?.offsetXCm ?? 0) / 100 / tileW;
    const offY = (uvw?.offsetYCm ?? 0) / 100 / tileH;

    const applyTransform = (tex: THREE.Texture | null) => {
      if (!tex) return null;
      tex.repeat.set(repeatX, repeatY);
      tex.center.set(0.5, 0.5);
      tex.rotation = rotRad;
      tex.offset.set(offX, offY);
      tex.needsUpdate = true;
      return tex;
    };

    return {
      color: color || '#ffffff',
      roughness: texture.roughness ?? defaultRoughness,
      metalness: texture.metalness ?? defaultMetalness,
      map: applyTransform(loadedMaps.map),
      normalMap: applyTransform(loadedMaps.normalMap),
      roughnessMap: applyTransform(loadedMaps.roughnessMap),
    };
  }, [
    texture,
    loadedMaps,
    color,
    surfaceWidthM,
    surfaceHeightM,
    overrideTileHeightM,
    uvw,
    defaultRoughness,
    defaultMetalness,
  ]);

  return configured;
}

interface WallPiece {
  key: string;
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

function buildWallPieces(
  totalLength: number,
  wallHeight: number,
  openings: WallOpening[]
): WallPiece[] {
  if (totalLength <= 0.02 || wallHeight <= 0.05) return [];

  const validOpenings = [...openings]
    .map((op) => {
      const start = Math.max(0, Math.min(totalLength, op.offsetFromStartM));
      const end = Math.max(
        start,
        Math.min(totalLength, op.offsetFromStartM + Math.max(0.1, op.widthM))
      );
      const sill = Math.max(0, Math.min(wallHeight - 0.05, op.sillHeightM));
      const top = Math.max(
        sill + 0.05,
        Math.min(wallHeight, op.sillHeightM + Math.max(0.1, op.heightM))
      );
      return { id: op.id, start, end, sill, top };
    })
    .filter((o) => o.end - o.start > 0.02)
    .sort((a, b) => a.start - b.start);

  if (validOpenings.length === 0) {
    return [
      {
        key: 'full',
        xCenter: 0,
        yCenter: wallHeight / 2,
        width: totalLength,
        height: wallHeight,
      },
    ];
  }

  const pieces: WallPiece[] = [];
  let cursor = 0;

  for (const op of validOpenings) {
    if (op.start > cursor + 0.005) {
      const segW = op.start - cursor;
      pieces.push({
        key: `solid-before-${op.id}`,
        xCenter: -totalLength / 2 + cursor + segW / 2,
        yCenter: wallHeight / 2,
        width: segW,
        height: wallHeight,
      });
    }

    const opW = op.end - op.start;
    const opXCenter = -totalLength / 2 + op.start + opW / 2;

    if (op.sill > 0.01) {
      pieces.push({
        key: `sill-${op.id}`,
        xCenter: opXCenter,
        yCenter: op.sill / 2,
        width: opW,
        height: op.sill,
      });
    }

    const headerH = wallHeight - op.top;
    if (headerH > 0.01) {
      pieces.push({
        key: `header-${op.id}`,
        xCenter: opXCenter,
        yCenter: op.top + headerH / 2,
        width: opW,
        height: headerH,
      });
    }

    cursor = Math.max(cursor, op.end);
  }

  if (cursor < totalLength - 0.005) {
    const tailW = totalLength - cursor;
    pieces.push({
      key: 'solid-tail',
      xCenter: -totalLength / 2 + cursor + tailW / 2,
      yCenter: wallHeight / 2,
      width: tailW,
      height: wallHeight,
    });
  }

  return pieces;
}

interface WallOpeningFrameProps {
  opening: WallOpening;
  totalWallLength: number;
  wallThickness: number;
  isSelected: boolean;
  onSelect: () => void;
}

function WallOpeningFrame({
  opening,
  totalWallLength,
  wallThickness,
  isSelected,
  onSelect,
}: WallOpeningFrameProps) {
  const w = Math.max(0.1, opening.widthM);
  const h = Math.max(0.1, opening.heightM);
  const xCenter = -totalWallLength / 2 + opening.offsetFromStartM + w / 2;
  const yCenter = opening.sillHeightM + h / 2;
  const frameT = 0.05;
  const frameDepth = wallThickness + 0.02;
  const frameColor = isSelected ? '#38bdf8' : opening.frameColor || '#f1f5f9';

  return (
    <group
      position={[xCenter, yCenter, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[-w / 2 + frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, frameDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      <mesh position={[w / 2 - frameT / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameT, h, frameDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      <mesh position={[0, h / 2 - frameT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, frameT, frameDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      {opening.type === 'window' && (
        <mesh position={[0, -h / 2 + frameT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.04, frameT, frameDepth + 0.04]} />
          <meshStandardMaterial color={frameColor} roughness={0.45} />
        </mesh>
      )}
      {opening.type === 'window' ? (
        <mesh>
          <boxGeometry
            args={[
              Math.max(0.05, w - frameT * 2),
              Math.max(0.05, h - frameT * 2),
              0.016,
            ]}
          />
          <meshPhysicalMaterial
            color="#bae6fd"
            transparent
            opacity={0.32}
            roughness={0.1}
            metalness={0.1}
            transmission={0.55}
          />
        </mesh>
      ) : (
        <mesh position={[0, -frameT / 2, 0]} castShadow receiveShadow>
          <boxGeometry
            args={[
              Math.max(0.05, w - frameT * 2),
              Math.max(0.05, h - frameT),
              0.04,
            ]}
          />
          <meshStandardMaterial color={frameColor} roughness={0.55} />
        </mesh>
      )}
    </group>
  );
}

interface WallSegmentItemProps {
  wall: WallSegment;
  allWalls: WallSegment[];
  ceilingHeightM: number;
  textures: CatalogTexture[];
  isTopView: boolean;
  isWallSelected: boolean;
  selectedOpeningId: string | null;
  selectedSurfaces: SurfaceTarget[];
  draggedTextureId: string | null;
  selectedWallVertex: SelectedWallVertex | null;
  onSelectWall: (wallId: string | null) => void;
  onSelectSurface?: (target: SurfaceTarget, additive: boolean) => void;
  onDropTextureOnSurface?: (target: SurfaceTarget, textureId: string) => void;
  onSelectOpening: (wallId: string, openingId: string) => void;
  onSelectWallVertex?: (vertex: SelectedWallVertex | null) => void;
  onStartDragVertex?: (
    wallId: string,
    endKey: 'start' | 'end',
    e: ThreeEvent<PointerEvent>
  ) => void;
}

function WallSegmentItem({
  wall,
  allWalls,
  ceilingHeightM,
  textures,
  isTopView,
  isWallSelected,
  selectedOpeningId,
  selectedSurfaces,
  draggedTextureId,
  selectedWallVertex,
  onSelectWall,
  onSelectSurface,
  onDropTextureOnSurface,
  onSelectOpening,
  onSelectWallVertex,
  onStartDragVertex,
}: WallSegmentItemProps) {
  const [hoveredSide, setHoveredSide] = useState<WallSide | null>(null);

  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const baseLength = Math.max(0.05, Math.hypot(dx, dz));
  const angleRad = Math.atan2(dz, dx);

  const { startExt, endExt } = useMemo(
    () => getWallJointExtensions(wall, allWalls),
    [wall, allWalls]
  );

  const { startCapColor, endCapColor } = useMemo(
    () => getWallEndCapColors(wall, allWalls),
    [wall, allWalls]
  );

  const renderedLength = Math.max(0.05, baseLength + startExt + endExt);
  const shiftAlongWall = (endExt - startExt) / 2;

  const ux = dx / baseLength;
  const uz = dz / baseLength;
  const midX = (wall.start[0] + wall.end[0]) / 2 + ux * shiftAlongWall;
  const midZ = (wall.start[1] + wall.end[1]) / 2 + uz * shiftAlongWall;

  const wallHeight = isTopView ? 0.28 : Math.max(0.2, ceilingHeightM);
  const thickness = Math.max(0.05, wall.thicknessM);

  const frontTex = useMemo(
    () => textures.find((t) => t.id === wall.frontTextureId) ?? null,
    [textures, wall.frontTextureId]
  );
  const backTex = useMemo(
    () => textures.find((t) => t.id === wall.backTextureId) ?? null,
    [textures, wall.backTextureId]
  );
  const startTex = useMemo(
    () => textures.find((t) => t.id === wall.startTextureId) ?? null,
    [textures, wall.startTextureId]
  );
  const endTex = useMemo(
    () => textures.find((t) => t.id === wall.endTextureId) ?? null,
    [textures, wall.endTextureId]
  );

  const frontMat = usePbrSurfaceMaterial({
    color: wall.frontColor || '#f1f5f9',
    texture: frontTex,
    surfaceWidthM: renderedLength,
    surfaceHeightM: wallHeight,
    overrideTileHeightM: wall.frontTileHeightM,
    uvw: wall.frontUvw,
  });

  const backMat = usePbrSurfaceMaterial({
    color: wall.backColor || '#f1f5f9',
    texture: backTex,
    surfaceWidthM: renderedLength,
    surfaceHeightM: wallHeight,
    overrideTileHeightM: wall.backTileHeightM,
    uvw: wall.backUvw,
  });

  const startMat = usePbrSurfaceMaterial({
    color: wall.startColor || startCapColor,
    texture: startTex,
    surfaceWidthM: thickness,
    surfaceHeightM: wallHeight,
    overrideTileHeightM: wall.startTileHeightM,
    uvw: wall.startUvw,
  });

  const endMat = usePbrSurfaceMaterial({
    color: wall.endColor || endCapColor,
    texture: endTex,
    surfaceWidthM: thickness,
    surfaceHeightM: wallHeight,
    overrideTileHeightM: wall.endTileHeightM,
    uvw: wall.endUvw,
  });

  const pieces = useMemo(
    () =>
      buildWallPieces(
        renderedLength,
        wallHeight,
        isTopView ? [] : wall.openings ?? []
      ),
    [renderedLength, wallHeight, isTopView, wall.openings]
  );

  const isSideSelected = (side: WallSide) =>
    selectedSurfaces.some((s) =>
      isSameSurface(s, { kind: 'wall', wallId: wall.id, side })
    );

  const handleFaceClick = (side: WallSide, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (onSelectSurface) {
      onSelectSurface({ kind: 'wall', wallId: wall.id, side }, additive);
    } else {
      onSelectWall(wall.id);
    }
  };

  const handleFacePointerUp = (side: WallSide, e: ThreeEvent<PointerEvent>) => {
    if (!draggedTextureId || !onDropTextureOnSurface) return;
    e.stopPropagation();
    onDropTextureOnSurface(
      { kind: 'wall', wallId: wall.id, side },
      draggedTextureId
    );
  };

  const getEmissiveForSide = (side: WallSide): string => {
    if (draggedTextureId && hoveredSide === side) return '#10b981';
    if (isSideSelected(side)) return '#0284c7';
    if (isWallSelected) return '#1e3a8a';
    return '#000000';
  };

  const getEmissiveIntensityForSide = (side: WallSide): number => {
    if (draggedTextureId && hoveredSide === side) return 0.42;
    if (isSideSelected(side)) return 0.25;
    if (isWallSelected) return 0.1;
    return 0;
  };

  const isStartVertexSelected =
    selectedWallVertex?.wallId === wall.id &&
    selectedWallVertex?.endKey === 'start';
  const isEndVertexSelected =
    selectedWallVertex?.wallId === wall.id &&
    selectedWallVertex?.endKey === 'end';

  return (
    <group>
      <group position={[midX, 0, midZ]} rotation={[0, -angleRad, 0]}>
        {pieces.map((p) => (
          <mesh
            key={p.key}
            position={[p.xCenter, p.yCenter, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[p.width, p.height, thickness]} />
            {/* 0: +X (end) */}
            <meshStandardMaterial
              attach="material-0"
              color={endMat.color}
              map={endMat.map}
              normalMap={endMat.normalMap}
              roughnessMap={endMat.roughnessMap}
              roughness={endMat.roughness}
              metalness={endMat.metalness}
              emissive={getEmissiveForSide('end')}
              emissiveIntensity={getEmissiveIntensityForSide('end')}
            />
            {/* 1: -X (start) */}
            <meshStandardMaterial
              attach="material-1"
              color={startMat.color}
              map={startMat.map}
              normalMap={startMat.normalMap}
              roughnessMap={startMat.roughnessMap}
              roughness={startMat.roughness}
              metalness={startMat.metalness}
              emissive={getEmissiveForSide('start')}
              emissiveIntensity={getEmissiveIntensityForSide('start')}
            />
            {/* 2: +Y (top cap) */}
            <meshStandardMaterial
              attach="material-2"
              color={isTopView ? '#475569' : '#cbd5e1'}
              roughness={0.9}
            />
            {/* 3: -Y (bottom) */}
            <meshStandardMaterial
              attach="material-3"
              color="#94a3b8"
              roughness={0.95}
            />
            {/* 4: +Z (front) */}
            <meshStandardMaterial
              attach="material-4"
              color={frontMat.color}
              map={frontMat.map}
              normalMap={frontMat.normalMap}
              roughnessMap={frontMat.roughnessMap}
              roughness={frontMat.roughness}
              metalness={frontMat.metalness}
              emissive={getEmissiveForSide('front')}
              emissiveIntensity={getEmissiveIntensityForSide('front')}
            />
            {/* 5: -Z (back) */}
            <meshStandardMaterial
              attach="material-5"
              color={backMat.color}
              map={backMat.map}
              normalMap={backMat.normalMap}
              roughnessMap={backMat.roughnessMap}
              roughness={backMat.roughness}
              metalness={backMat.metalness}
              emissive={getEmissiveForSide('back')}
              emissiveIntensity={getEmissiveIntensityForSide('back')}
            />
          </mesh>
        ))}

        {/* Front (+Z) */}
        <mesh
          position={[0, wallHeight / 2, thickness / 2 + 0.004]}
          onClick={(e) => handleFaceClick('front', e)}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredSide('front');
          }}
          onPointerOut={() => setHoveredSide(null)}
          onPointerUp={(e) => handleFacePointerUp('front', e)}
        >
          <planeGeometry args={[renderedLength, wallHeight]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Back (-Z) */}
        <mesh
          position={[0, wallHeight / 2, -thickness / 2 - 0.004]}
          rotation={[0, Math.PI, 0]}
          onClick={(e) => handleFaceClick('back', e)}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredSide('back');
          }}
          onPointerOut={() => setHoveredSide(null)}
          onPointerUp={(e) => handleFacePointerUp('back', e)}
        >
          <planeGeometry args={[renderedLength, wallHeight]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* End (+X) */}
        <mesh
          position={[renderedLength / 2 + 0.004, wallHeight / 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
          onClick={(e) => handleFaceClick('end', e)}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredSide('end');
          }}
          onPointerOut={() => setHoveredSide(null)}
          onPointerUp={(e) => handleFacePointerUp('end', e)}
        >
          <planeGeometry args={[thickness, wallHeight]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Start (-X) */}
        <mesh
          position={[-renderedLength / 2 - 0.004, wallHeight / 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          onClick={(e) => handleFaceClick('start', e)}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredSide('start');
          }}
          onPointerOut={() => setHoveredSide(null)}
          onPointerUp={(e) => handleFacePointerUp('start', e)}
        >
          <planeGeometry args={[thickness, wallHeight]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {!isTopView &&
          (wall.openings ?? []).map((op) => (
            <WallOpeningFrame
              key={op.id}
              opening={op}
              totalWallLength={renderedLength}
              wallThickness={thickness}
              isSelected={selectedOpeningId === op.id}
              onSelect={() => onSelectOpening(wall.id, op.id)}
            />
          ))}
      </group>

      {(isWallSelected || isTopView) && (
        <>
          <mesh
            position={[
              wall.start[0],
              isTopView ? 0.34 : wallHeight + 0.08,
              wall.start[1],
            ]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectWall(wall.id);
              onSelectWallVertex?.({ wallId: wall.id, endKey: 'start' });
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectWall(wall.id);
              onSelectWallVertex?.({ wallId: wall.id, endKey: 'start' });
              onStartDragVertex?.(wall.id, 'start', e);
            }}
          >
            <sphereGeometry args={[isStartVertexSelected ? 0.13 : 0.095, 16, 16]} />
            <meshStandardMaterial
              color={isStartVertexSelected ? '#f59e0b' : '#38bdf8'}
              emissive={isStartVertexSelected ? '#d97706' : '#0284c7'}
              emissiveIntensity={0.4}
            />
          </mesh>

          <mesh
            position={[
              wall.end[0],
              isTopView ? 0.34 : wallHeight + 0.08,
              wall.end[1],
            ]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectWall(wall.id);
              onSelectWallVertex?.({ wallId: wall.id, endKey: 'end' });
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectWall(wall.id);
              onSelectWallVertex?.({ wallId: wall.id, endKey: 'end' });
              onStartDragVertex?.(wall.id, 'end', e);
            }}
          >
            <sphereGeometry args={[isEndVertexSelected ? 0.13 : 0.095, 16, 16]} />
            <meshStandardMaterial
              color={isEndVertexSelected ? '#f59e0b' : '#38bdf8'}
              emissive={isEndVertexSelected ? '#d97706' : '#0284c7'}
              emissiveIntensity={0.4}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

interface FloorZoneItemProps {
  zone: FloorZone;
  textures: CatalogTexture[];
  isSelected: boolean;
  isSurfaceSelected: boolean;
  draggedTextureId: string | null;
  selectedFloorVertex?: SelectedFloorVertex | null;
  onSelectSurface?: (target: SurfaceTarget, additive: boolean) => void;
  onSelectFloorZone?: (zoneId: string | null) => void;
  onSelectFloorVertex?: (vertex: SelectedFloorVertex | null) => void;
  onDropTextureOnSurface?: (target: SurfaceTarget, textureId: string) => void;
}

function FloorZoneItem({
  zone,
  textures,
  isSelected,
  isSurfaceSelected,
  draggedTextureId,
  selectedFloorVertex,
  onSelectSurface,
  onSelectFloorZone,
  onSelectFloorVertex,
  onDropTextureOnSurface,
}: FloorZoneItemProps) {
  const [hovered, setHovered] = useState(false);

  const { geometry, widthM, depthM } = useMemo(() => {
    if (zone.points.length < 3) {
      return { geometry: null, widthM: 1, depthM: 1 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const [x, z] of zone.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const shape = new THREE.Shape();
    shape.moveTo(zone.points[0][0], -zone.points[0][1]);
    for (let i = 1; i < zone.points.length; i++) {
      shape.lineTo(zone.points[i][0], -zone.points[i][1]);
    }
    shape.closePath();

    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      uvs[i * 2] = vx - minX;
      uvs[i * 2 + 1] = vz - minZ;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.computeVertexNormals();

    return {
      geometry: geom,
      widthM: Math.max(0.2, maxX - minX),
      depthM: Math.max(0.2, maxZ - minZ),
    };
  }, [zone.points]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  const zoneTex = useMemo(
    () => textures.find((t) => t.id === zone.textureId) ?? null,
    [textures, zone.textureId]
  );

  const mat = usePbrSurfaceMaterial({
    color: zone.color || '#b08968',
    texture: zoneTex,
    surfaceWidthM: 1,
    surfaceHeightM: 1,
    uvw: {
      ...zone.uvw,
      rotationDeg: zone.uvw?.rotationDeg ?? zone.textureRotationDeg ?? 0,
    },
    defaultRoughness: zone.roughness ?? 0.55,
    defaultMetalness: zone.metalness ?? 0.05,
  });

  if (!geometry || widthM <= 0 || depthM <= 0) return null;

  const emissive =
    draggedTextureId && hovered
      ? '#10b981'
      : isSurfaceSelected || isSelected
        ? '#0284c7'
        : '#000000';

  const emissiveIntensity =
    draggedTextureId && hovered
      ? 0.4
      : isSurfaceSelected || isSelected
        ? 0.2
        : 0;

  return (
    <group>
      <mesh
        geometry={geometry}
        position={[0, 0.004, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          const additive = e.shiftKey || e.ctrlKey || e.metaKey;
          if (onSelectSurface) {
            onSelectSurface({ kind: 'floor', zoneId: zone.id }, additive);
          } else {
            onSelectFloorZone?.(zone.id);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onPointerUp={(e) => {
          if (!draggedTextureId || !onDropTextureOnSurface) return;
          e.stopPropagation();
          onDropTextureOnSurface(
            { kind: 'floor', zoneId: zone.id },
            draggedTextureId
          );
        }}
      >
        <meshStandardMaterial
          color={mat.color}
          map={mat.map}
          normalMap={mat.normalMap}
          roughnessMap={mat.roughnessMap}
          roughness={mat.roughness}
          metalness={mat.metalness}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {isSelected &&
        zone.points.map((pt, idx) => {
          const isVSelected =
            selectedFloorVertex?.zoneId === zone.id &&
            selectedFloorVertex?.pointIndex === idx;
          return (
            <mesh
              key={`fz-handle-${idx}`}
              position={[pt[0], 0.06, pt[1]]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFloorVertex?.({ zoneId: zone.id, pointIndex: idx });
              }}
            >
              <sphereGeometry args={[isVSelected ? 0.11 : 0.08, 14, 14]} />
              <meshStandardMaterial
                color={isVSelected ? '#f59e0b' : '#10b981'}
                emissive={isVSelected ? '#d97706' : '#059669'}
                emissiveIntensity={0.45}
              />
            </mesh>
          );
        })}
    </group>
  );
}

interface StandaloneOpeningItemProps {
  opening: StandaloneOpening;
  isSelected: boolean;
  onSelect: () => void;
  onStartDrag?: (e: ThreeEvent<PointerEvent>) => void;
}

function StandaloneOpeningItem({
  opening,
  isSelected,
  onSelect,
  onStartDrag,
}: StandaloneOpeningItemProps) {
  const rotRad = (opening.rotationDeg * Math.PI) / 180;
  const w = Math.max(0.2, opening.widthM);
  const h = Math.max(0.2, opening.heightM);
  const t = Math.max(0.05, opening.thicknessM);
  const yCenter = opening.sillHeightM + h / 2;
  const frameT = 0.05;
  const color = isSelected ? '#38bdf8' : opening.frameColor || '#f1f5f9';

  return (
    <group
      position={[opening.position[0], yCenter, opening.position[1]]}
      rotation={[0, -rotRad, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        onStartDrag?.(e);
      }}
    >
      <mesh position={[-w / 2 + frameT / 2, 0, 0]} castShadow>
        <boxGeometry args={[frameT, h, t + 0.02]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[w / 2 - frameT / 2, 0, 0]} castShadow>
        <boxGeometry args={[frameT, h, t + 0.02]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, h / 2 - frameT / 2, 0]} castShadow>
        <boxGeometry args={[w, frameT, t + 0.02]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {opening.type === 'window' ? (
        <>
          <mesh position={[0, -h / 2 + frameT / 2, 0]} castShadow>
            <boxGeometry args={[w + 0.04, frameT, t + 0.05]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
          <mesh>
            <boxGeometry args={[w - frameT * 2, h - frameT * 2, 0.015]} />
            <meshPhysicalMaterial
              color="#bae6fd"
              transparent
              opacity={0.35}
              roughness={0.1}
            />
          </mesh>
        </>
      ) : (
        <mesh position={[0, -frameT / 2, 0]} castShadow>
          <boxGeometry args={[w - frameT * 2, h - frameT, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      )}
    </group>
  );
}

function FloorplanUnderlayPlane({
  floorplan,
}: {
  floorplan: NonNullable<RoomConfig['floorplan']>;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!floorplan.imageUrl) {
      setTex(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(floorplan.imageUrl, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
      setTex(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [floorplan.imageUrl]);

  useEffect(() => {
    return () => {
      tex?.dispose();
    };
  }, [tex]);

  if (!floorplan.visible || !tex) return null;

  return (
    <mesh
      position={[floorplan.offsetX, 0.0015, floorplan.offsetZ]}
      rotation={[-Math.PI / 2, 0, -(floorplan.rotationDeg * Math.PI) / 180]}
    >
      <planeGeometry args={[floorplan.widthM, floorplan.depthM]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={floorplan.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

export function RoomMesh({
  room,
  textures,
  isTopView = false,
  selectedWallId,
  selectedOpeningId,
  selectedStandaloneOpeningId,
  selectedFloorZoneId,
  selectedSurfaces,
  draggedTextureId,
  selectedWallVertex,
  selectedFloorVertex = null,
  onSelectWall,
  onSelectSurface,
  onClearSurfaceSelection,
  onDropTextureOnSurface,
  onSelectOpening,
  onSelectStandaloneOpening,
  onSelectFloorZone,
  onSelectWallVertex,
  onSelectFloorVertex,
  isDrawingWalls = false,
  hoverPoint = null,
  onHoverPointChange,
  onFloorDrawClick,
  isDrawingFloorZone = false,
  onFloorZoneDrawClick,
  isCalibratingPlan = false,
  onCalibFloorClick,
  onStartDragVertex,
  onStartDragStandaloneOpening,
}: RoomMeshProps) {
  const isInteractiveFloorMode =
    isDrawingWalls || isDrawingFloorZone || isCalibratingPlan;

  const ceilingGeometries = useMemo(() => {
    if (!room.showCeiling || isTopView) return [];
    const polys = findClosedRoomPolygons(room.walls);
    return polys.map((pts) => {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], -pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], -pts[i][1]);
      }
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(Math.PI / 2);
      return geom;
    });
  }, [room.showCeiling, room.walls, isTopView]);

  useEffect(() => {
    return () => {
      ceilingGeometries.forEach((g) => g.dispose());
    };
  }, [ceilingGeometries]);

  return (
    <group>
      {/* Основна плоча на пода (за деселекция или чертане/калибрация) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.002, 0]}
        receiveShadow
        onPointerMove={(e) => {
          if (!isInteractiveFloorMode) return;
          e.stopPropagation();
          onHoverPointChange?.([
            Math.round(e.point.x * 20) / 20,
            Math.round(e.point.z * 20) / 20,
          ]);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const pt: [number, number] = hoverPoint ?? [
            Math.round(e.point.x * 20) / 20,
            Math.round(e.point.z * 20) / 20,
          ];
          if (isDrawingWalls) {
            onFloorDrawClick?.(pt);
            return;
          }
          if (isDrawingFloorZone) {
            onFloorZoneDrawClick?.(pt);
            return;
          }
          if (isCalibratingPlan) {
            onCalibFloorClick?.(pt);
            return;
          }
          onSelectWall(null);
          onSelectStandaloneOpening(null);
          onSelectFloorZone?.(null);
          onSelectWallVertex?.(null);
          onSelectFloorVertex?.(null);
          onClearSurfaceSelection?.();
        }}
      >
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1e293b" roughness={0.95} metalness={0.02} />
      </mesh>

      {/* 2D Архитектурна подложка */}
      {room.floorplan && <FloorplanUnderlayPlane floorplan={room.floorplan} />}

      {/* Подови зони */}
      {(room.floorZones ?? []).map((zone) => (
        <FloorZoneItem
          key={zone.id}
          zone={zone}
          textures={textures}
          isSelected={selectedFloorZoneId === zone.id}
          isSurfaceSelected={selectedSurfaces.some((s) =>
            isSameSurface(s, { kind: 'floor', zoneId: zone.id })
          )}
          draggedTextureId={draggedTextureId}
          selectedFloorVertex={selectedFloorVertex}
          onSelectSurface={onSelectSurface}
          onSelectFloorZone={onSelectFloorZone}
          onSelectFloorVertex={onSelectFloorVertex}
          onDropTextureOnSurface={onDropTextureOnSurface}
        />
      ))}

      {/* Стени */}
      {room.walls.map((wall) => (
        <WallSegmentItem
          key={wall.id}
          wall={wall}
          allWalls={room.walls}
          ceilingHeightM={room.ceilingHeightM}
          textures={textures}
          isTopView={isTopView}
          isWallSelected={selectedWallId === wall.id}
          selectedOpeningId={
            selectedWallId === wall.id ? selectedOpeningId : null
          }
          selectedSurfaces={selectedSurfaces}
          draggedTextureId={draggedTextureId}
          selectedWallVertex={selectedWallVertex}
          onSelectWall={onSelectWall}
          onSelectSurface={onSelectSurface}
          onDropTextureOnSurface={onDropTextureOnSurface}
          onSelectOpening={onSelectOpening}
          onSelectWallVertex={onSelectWallVertex}
          onStartDragVertex={onStartDragVertex}
        />
      ))}

      {/* Свободни врати и прозорци */}
      {(room.openings ?? []).map((op) => (
        <StandaloneOpeningItem
          key={op.id}
          opening={op}
          isSelected={selectedStandaloneOpeningId === op.id}
          onSelect={() => onSelectStandaloneOpening(op.id)}
          onStartDrag={(e) => onStartDragStandaloneOpening?.(op.id, e)}
        />
      ))}

      {/* Таван */}
      {ceilingGeometries.map((geom, idx) => (
        <mesh
          key={`ceiling-${idx}`}
          geometry={geom}
          position={[0, room.ceilingHeightM, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color={room.ceilingColor || '#f8fafc'}
            roughness={0.92}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default RoomMesh;