import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, TransformControls } from '@react-three/drei';
import type {
  CatalogTexture,
  FrontStyleType,
  HandleStyleType,
  KitchenModuleType,
  KitchenSpec,
  ParametricFurnitureConfig,
  SceneObject,
  TransformTool,
  WardrobeSpec,
} from '../types/editor';
import type { WallSegment } from '../types/room';
import {
  snapFurnitureToWalls,
  type WallDistanceGuide,
} from '../utils/furnitureSnap';
import { KitchenSinkAssembly } from './KitchenSinkAssembly';
import { FurnitureWallGuides } from './FurnitureWallGuides';

export interface ParametricFurnitureMeshProps {
  item: SceneObject;
  config: ParametricFurnitureConfig;
  textures: CatalogTexture[];
  walls?: WallSegment[];
  isSelected: boolean;
  transformTool: TransformTool;
  onSelect: (instanceId: string) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
  onDraggingChange: (dragging: boolean) => void;
}

function loadTextureWithFallback(url?: string | null): Promise<THREE.Texture | null> {
  if (!url) return Promise.resolve(null);
  const attempt = (crossOrigin: string | null): Promise<THREE.Texture | null> =>
    new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      if (crossOrigin !== null) loader.setCrossOrigin(crossOrigin);
      loader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });
  return attempt('anonymous').then((t) => t ?? attempt(null));
}

function useSimpleTexturedMaterial(
  color: string,
  textureId: string | null | undefined,
  textures: CatalogTexture[],
  roughness = 0.55,
  metalness = 0.05
) {
  const texDef = useMemo(
    () => (textureId ? textures.find((t) => t.id === textureId) ?? null : null),
    [textureId, textures]
  );

  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!texDef?.mapUrl) {
      setMap(null);
      return;
    }
    let cancelled = false;
    let loaded: THREE.Texture | null = null;
    loadTextureWithFallback(texDef.mapUrl).then((t) => {
      if (cancelled) {
        t?.dispose();
        return;
      }
      if (t) {
        const rep = Math.max(1, Math.round(1 / Math.max(0.2, texDef.tileWidthM || 0.6)));
        t.repeat.set(rep, rep);
      }
      loaded = t;
      setMap(t);
    });
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [texDef?.mapUrl, texDef?.tileWidthM]);

  return {
    color: map ? '#ffffff' : color,
    map,
    roughness: texDef?.roughness ?? roughness,
    metalness: texDef?.metalness ?? metalness,
  };
}

interface DoorLeafProps {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  thickness?: number;
  frontStyle: FrontStyleType;
  handleStyle: HandleStyleType;
  hingeSide?: 'left' | 'right' | 'center';
  frontColor: string;
  frontMap: THREE.Texture | null;
  frontRoughness: number;
  frontMetalness: number;
  handleColor: string;
  isDrawer?: boolean;
  isMirror?: boolean;
  isOpen?: boolean;
  isSliding?: boolean;
  slideDir?: number;
}

function DoorOrDrawerLeaf({
  x,
  y,
  z,
  width,
  height,
  thickness = 0.019,
  frontStyle,
  handleStyle,
  hingeSide = 'left',
  frontColor,
  frontMap,
  frontRoughness,
  frontMetalness,
  handleColor,
  isDrawer = false,
  isMirror = false,
  isOpen = false,
  isSliding = false,
  slideDir = 1,
}: DoorLeafProps) {
  const animGroupRef = useRef<THREE.Group | null>(null);
  const progressRef = useRef(0);

  const gap = 0.004;
  const w = Math.max(0.06, width - gap);
  const h = Math.max(0.06, height - gap);
  const frameBorder = Math.min(0.055, w * 0.16, h * 0.16);

  useFrame((_, delta) => {
    const target = isOpen ? 1 : 0;
    const step = Math.min(1, delta * 7);
    progressRef.current += (target - progressRef.current) * step;

    const g = animGroupRef.current;
    if (!g) return;

    const p = progressRef.current;
    if (isDrawer) {
      g.position.set(x, y, z + p * 0.24);
      g.rotation.set(0, 0, 0);
    } else if (isSliding) {
      g.position.set(x + p * slideDir * (w * 0.72), y, z);
      g.rotation.set(0, 0, 0);
    } else if (hingeSide === 'right') {
      const pivotX = x + w / 2;
      const angle = p * (Math.PI * 0.46);
      g.rotation.set(0, angle, 0);
      g.position.set(
        pivotX - (w / 2) * Math.cos(angle),
        y,
        z + (w / 2) * Math.sin(angle)
      );
    } else {
      const pivotX = x - w / 2;
      const angle = -p * (Math.PI * 0.46);
      g.rotation.set(0, angle, 0);
      g.position.set(
        pivotX + (w / 2) * Math.cos(angle),
        y,
        z - (w / 2) * Math.sin(angle)
      );
    }
  });

  const handleNode = useMemo(() => {
    if (frontStyle === 'gola' || handleStyle === 'none') return null;

    if (isDrawer || handleStyle === 'horizontal') {
      const hLen = Math.min(0.18, w * 0.45);
      const hy = isDrawer ? 0 : h / 2 - 0.06;
      return (
        <mesh position={[0, hy, thickness / 2 + 0.012]} castShadow>
          <boxGeometry args={[hLen, 0.012, 0.022]} />
          <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.75} />
        </mesh>
      );
    }

    if (handleStyle === 'knob') {
      const hx =
        hingeSide === 'center'
          ? 0
          : hingeSide === 'left'
            ? w / 2 - 0.045
            : -w / 2 + 0.045;
      return (
        <mesh
          position={[hx, 0, thickness / 2 + 0.012]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.014, 0.014, 0.022, 16]} />
          <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.75} />
        </mesh>
      );
    }

    const hLen = Math.min(0.24, h * 0.35);
    const hx =
      hingeSide === 'center'
        ? 0
        : hingeSide === 'left'
          ? w / 2 - 0.04
          : -w / 2 + 0.04;
    const hy = h > 1.2 ? -0.12 : 0;
    return (
      <mesh position={[hx, hy, thickness / 2 + 0.012]} castShadow>
        <boxGeometry args={[0.012, hLen, 0.022]} />
        <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.75} />
      </mesh>
    );
  }, [frontStyle, handleStyle, hingeSide, isDrawer, w, h, thickness, handleColor]);

  if (isMirror && !isDrawer) {
    const mirrorInset = 0.014;
    const mirrorW = Math.max(0.04, w - mirrorInset);
    const mirrorH = Math.max(0.04, h - mirrorInset);

    return (
      <group ref={animGroupRef} position={[x, y, z]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, thickness * 0.85]} />
          <meshStandardMaterial
            key={`mir-base-${frontMap?.uuid ?? 'none'}`}
            color={frontColor}
            map={frontMap}
            roughness={frontRoughness}
            metalness={frontMetalness}
          />
        </mesh>
        <mesh position={[0, 0, thickness * 0.45 + 0.002]}>
          <planeGeometry args={[mirrorW, mirrorH]} />
          <MeshReflectorMaterial
            mirror={0.92}
            resolution={512}
            mixBlur={0}
            mixStrength={1.2}
            roughness={0.04}
            metalness={0.15}
            color="#eef2f6"
            depthScale={0}
          />
        </mesh>
        {handleNode}
      </group>
    );
  }

  return (
    <group ref={animGroupRef} position={[x, y, z]}>
      {frontStyle === 'shaker' && w > 0.16 && h > 0.16 ? (
        <>
          <mesh position={[0, 0, -0.002]} castShadow receiveShadow>
            <boxGeometry
              args={[w - frameBorder * 2 + 0.004, h - frameBorder * 2 + 0.004, thickness * 0.65]}
            />
            <meshStandardMaterial
              key={`shaker-in-${frontMap?.uuid ?? 'none'}`}
              color={frontColor}
              map={frontMap}
              roughness={frontRoughness}
              metalness={frontMetalness}
            />
          </mesh>
          <mesh position={[-w / 2 + frameBorder / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[frameBorder, h, thickness]} />
            <meshStandardMaterial
              key={`shaker-l-${frontMap?.uuid ?? 'none'}`}
              color={frontColor}
              map={frontMap}
              roughness={frontRoughness}
              metalness={frontMetalness}
            />
          </mesh>
          <mesh position={[w / 2 - frameBorder / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[frameBorder, h, thickness]} />
            <meshStandardMaterial
              key={`shaker-r-${frontMap?.uuid ?? 'none'}`}
              color={frontColor}
              map={frontMap}
              roughness={frontRoughness}
              metalness={frontMetalness}
            />
          </mesh>
          <mesh
            position={[0, h / 2 - frameBorder / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w - frameBorder * 2, frameBorder, thickness]} />
            <meshStandardMaterial
              key={`shaker-t-${frontMap?.uuid ?? 'none'}`}
              color={frontColor}
              map={frontMap}
              roughness={frontRoughness}
              metalness={frontMetalness}
            />
          </mesh>
          <mesh
            position={[0, -h / 2 + frameBorder / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w - frameBorder * 2, frameBorder, thickness]} />
            <meshStandardMaterial
              key={`shaker-b-${frontMap?.uuid ?? 'none'}`}
              color={frontColor}
              map={frontMap}
              roughness={frontRoughness}
              metalness={frontMetalness}
            />
          </mesh>
        </>
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, thickness]} />
          <meshStandardMaterial
            key={`flat-${frontMap?.uuid ?? 'none'}`}
            color={frontColor}
            map={frontMap}
            roughness={frontRoughness}
            metalness={frontMetalness}
          />
        </mesh>
      )}
      {handleNode}
    </group>
  );
}

function WardrobeGeometry({
  spec,
  textures,
}: {
  spec: WardrobeSpec;
  textures: CatalogTexture[];
}) {
  const W = Math.max(0.4, spec.widthCm / 100);
  const totalH = Math.max(1.0, spec.heightCm / 100);
  const D = Math.max(0.35, spec.depthCm / 100);
  const plinthH = Math.max(0, Math.min(0.2, spec.plinthHeightCm / 100));
  const bridgeH = spec.hasTopBridge
    ? Math.max(0.25, Math.min(0.8, spec.topBridgeHeightCm / 100))
    : 0;
  const mainBodyH = Math.max(0.8, totalH - plinthH - bridgeH);
  const panelT = 0.018;

  const corpusMat = useSimpleTexturedMaterial(
    spec.corpusColor,
    spec.corpusTextureId,
    textures,
    0.65,
    0.04
  );
  const frontMat = useSimpleTexturedMaterial(
    spec.frontColor,
    spec.frontTextureId,
    textures,
    0.45,
    0.05
  );

  const doors = Math.max(1, Math.min(6, Math.round(spec.doorCount)));
  const doorW = W / doors;
  const mirrorSet = useMemo(
    () => new Set(spec.mirrorDoorIndices ?? []),
    [spec.mirrorDoorIndices]
  );

  const drawerRows =
    spec.doorType === 'hinged'
      ? Math.max(0, Math.min(4, Math.round(spec.bottomDrawersCount)))
      : 0;
  const drawerZoneH = drawerRows * 0.19;
  const upperDoorH = Math.max(0.4, mainBodyH - drawerZoneH);
  const interiorMode = spec.interiorLayout ?? 'mixed';
  const isOpen = Boolean(spec.doorsOpen);

  return (
    <group>
      {plinthH > 0.005 && (
        <mesh position={[0, plinthH / 2, -0.015]} castShadow receiveShadow>
          <boxGeometry args={[W - 0.01, plinthH, D - 0.03]} />
          <meshStandardMaterial color={spec.plinthColor} roughness={0.7} />
        </mesh>
      )}

      <group position={[0, plinthH, 0]}>
        <mesh position={[0, panelT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[W, panelT, D]} />
          <meshStandardMaterial
            key={`wc-bot-${corpusMat.map?.uuid ?? 'none'}`}
            color={corpusMat.color}
            map={corpusMat.map}
            roughness={corpusMat.roughness}
          />
        </mesh>
        <mesh position={[0, mainBodyH - panelT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[W, panelT, D]} />
          <meshStandardMaterial
            key={`wc-top-${corpusMat.map?.uuid ?? 'none'}`}
            color={corpusMat.color}
            map={corpusMat.map}
            roughness={corpusMat.roughness}
          />
        </mesh>

        {Array.from({ length: doors + 1 }).map((_, idx) => {
          const isOuter = idx === 0 || idx === doors;
          const px =
            -W / 2 +
            idx * doorW +
            (idx === 0 ? panelT / 2 : idx === doors ? -panelT / 2 : 0);
          return (
            <mesh
              key={`w-div-${idx}`}
              position={[px, mainBodyH / 2, isOuter ? 0 : -0.015]}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={[panelT, mainBodyH - panelT * 2, isOuter ? D : D - 0.035]}
              />
              <meshStandardMaterial
                key={`wc-div-${corpusMat.map?.uuid ?? 'none'}`}
                color={corpusMat.color}
                map={corpusMat.map}
                roughness={corpusMat.roughness}
              />
            </mesh>
          );
        })}

        <mesh position={[0, mainBodyH / 2, -D / 2 + 0.004]}>
          <boxGeometry args={[W - 0.006, mainBodyH - 0.006, 0.006]} />
          <meshStandardMaterial color={spec.corpusColor} roughness={0.85} />
        </mesh>

        {/* Вътрешно разпределение */}
        {Array.from({ length: doors }).map((_, idx) => {
          const cx = -W / 2 + doorW * (idx + 0.5);
          const innerW = Math.max(0.1, doorW - panelT * 1.4);
          const innerD = Math.max(0.2, D - 0.055);
          const startY = drawerZoneH + panelT;
          const availH = Math.max(0.4, mainBodyH - panelT - startY);

          const hasRail =
            interiorMode === 'rail-and-shelves' ||
            (interiorMode === 'mixed' && idx % 2 === 0);

          const shelfHeights = hasRail
            ? [startY + availH * 0.78]
            : [
                startY + availH * 0.22,
                startY + availH * 0.44,
                startY + availH * 0.66,
                startY + availH * 0.85,
              ];

          return (
            <group key={`w-int-${idx}`}>
              {shelfHeights.map((sy, sIdx) => (
                <mesh
                  key={`w-sh-${idx}-${sIdx}`}
                  position={[cx, sy, -0.015]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[innerW, 0.016, innerD]} />
                  <meshStandardMaterial
                    color={corpusMat.color}
                    map={corpusMat.map}
                    roughness={corpusMat.roughness}
                  />
                </mesh>
              ))}

              {hasRail && (
                <mesh
                  position={[cx, startY + availH * 0.71, -0.01]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.012, 0.012, innerW, 14]} />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    roughness={0.25}
                    metalness={0.55}
                  />
                </mesh>
              )}
            </group>
          );
        })}

        {/* Врати и чекмеджета */}
        {Array.from({ length: doors }).map((_, idx) => {
          const cx = -W / 2 + doorW * (idx + 0.5);
          const isSliding = spec.doorType === 'sliding';
          const zOffset = isSliding
            ? D / 2 + (idx % 2 === 0 ? 0.026 : 0.006)
            : D / 2 + 0.011;
          const actualDoorW = isSliding ? doorW + 0.03 : doorW;
          const hasMirror = mirrorSet.has(idx);

          return (
            <group key={`w-sec-${idx}`}>
              {Array.from({ length: drawerRows }).map((__, rIdx) => (
                <DoorOrDrawerLeaf
                  key={`w-drw-${idx}-${rIdx}`}
                  x={cx}
                  y={rIdx * 0.19 + 0.095}
                  z={D / 2 + 0.011}
                  width={doorW}
                  height={0.188}
                  frontStyle={spec.frontStyle}
                  handleStyle={spec.handleStyle}
                  frontColor={frontMat.color}
                  frontMap={frontMat.map}
                  frontRoughness={frontMat.roughness}
                  frontMetalness={frontMat.metalness}
                  handleColor={spec.handleColor}
                  isDrawer
                  isOpen={isOpen}
                />
              ))}

              <DoorOrDrawerLeaf
                x={cx}
                y={drawerZoneH + upperDoorH / 2}
                z={zOffset}
                width={actualDoorW}
                height={upperDoorH}
                frontStyle={spec.frontStyle}
                handleStyle={isSliding ? 'vertical' : spec.handleStyle}
                hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                frontColor={frontMat.color}
                frontMap={frontMat.map}
                frontRoughness={frontMat.roughness}
                frontMetalness={frontMat.metalness}
                handleColor={spec.handleColor}
                isMirror={hasMirror}
                isOpen={isOpen}
                isSliding={isSliding}
                slideDir={idx % 2 === 0 ? 1 : -1}
              />
            </group>
          );
        })}
      </group>

      {spec.hasTopBridge && bridgeH > 0.1 && (
        <group position={[0, plinthH + mainBodyH, 0]}>
          <mesh position={[0, bridgeH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[W, bridgeH, D]} />
            <meshStandardMaterial
              key={`wc-br-${corpusMat.map?.uuid ?? 'none'}`}
              color={corpusMat.color}
              map={corpusMat.map}
              roughness={corpusMat.roughness}
            />
          </mesh>
          {Array.from({ length: doors }).map((_, idx) => (
            <DoorOrDrawerLeaf
              key={`w-br-door-${idx}`}
              x={-W / 2 + doorW * (idx + 0.5)}
              y={bridgeH / 2}
              z={D / 2 + 0.011}
              width={doorW}
              height={bridgeH}
              frontStyle={spec.frontStyle}
              handleStyle={spec.handleStyle}
              hingeSide={idx % 2 === 0 ? 'left' : 'right'}
              frontColor={frontMat.color}
              frontMap={frontMat.map}
              frontRoughness={frontMat.roughness}
              frontMetalness={frontMat.metalness}
              handleColor={spec.handleColor}
              isMirror={mirrorSet.has(idx)}
              isOpen={isOpen}
            />
          ))}
        </group>
      )}
    </group>
  );
}

function KitchenRunSegment({
  widthM,
  baseD,
  plinthH,
  topT,
  overhang,
  baseTotalH,
  baseBoxH,
  backsplashH,
  wallCabH,
  wallCabD,
  modCount,
  moduleOffsetIdx,
  spec,
  corpusMat,
  frontMat,
  topMat,
  backMat,
  isCornerWing = false,
  cornerSide,
}: {
  widthM: number;
  baseD: number;
  plinthH: number;
  topT: number;
  overhang: number;
  baseTotalH: number;
  baseBoxH: number;
  backsplashH: number;
  wallCabH: number;
  wallCabD: number;
  modCount: number;
  moduleOffsetIdx: number;
  spec: KitchenSpec;
  corpusMat: ReturnType<typeof useSimpleTexturedMaterial>;
  frontMat: ReturnType<typeof useSimpleTexturedMaterial>;
  topMat: ReturnType<typeof useSimpleTexturedMaterial>;
  backMat: ReturnType<typeof useSimpleTexturedMaterial>;
  isCornerWing?: boolean;
  cornerSide?: 'l-left' | 'l-right';
}) {
  const W = Math.max(0.4, widthM);
  const count = Math.max(1, Math.min(8, Math.round(modCount)));
  const modW = W / count;
  const isOpen = Boolean(spec.doorsOpen);
  const hoodType = spec.hoodType ?? 'chimney';
  const ledPercent = spec.hasUnderCabinetLed === false ? 0 : (spec.ledIntensity ?? 100);
  const ledFactor = Math.max(0, Math.min(2, ledPercent / 100));

  const getModType = (idx: number): KitchenModuleType => {
    if (isCornerWing) {
      return idx % 2 === 0 ? 'doors' : 'drawers';
    }
    return spec.modulePattern[idx % spec.modulePattern.length] ?? 'doors';
  };

  const showBase =
    spec.layoutMode === 'base-only' || spec.layoutMode === 'base-and-wall';
  const showWall =
    spec.layoutMode === 'wall-only' || spec.layoutMode === 'base-and-wall';

  const wallStartY =
    spec.layoutMode === 'wall-only' ? 1.45 : baseTotalH + backsplashH;
  const wallZOffset = -baseD / 2 + wallCabD / 2;

  const cornerDir = cornerSide === 'l-left' ? 1 : -1;
  const upperCornerBridge = isCornerWing ? Math.max(0, baseD - wallCabD) : 0;
  const wallTotalW = W + upperCornerBridge;
  const wallShiftX = isCornerWing ? cornerDir * (upperCornerBridge / 2) : 0;

  const wallModCount = isCornerWing
    ? Math.max(1, Math.round(wallTotalW / Math.max(0.35, modW)))
    : count;
  const wallModW = wallTotalW / wallModCount;

  const totalTopD = baseD + overhang;
  const topCenterZ = overhang / 2;

  // Брой точкови светлини по дължината на горния ред за реално осветяване на плота
  const ledLightCount = Math.max(1, Math.min(4, Math.round(wallTotalW / 0.75)));

  return (
    <group>
      {showBase && (
        <group>
          {plinthH > 0.005 && (
            <mesh position={[0, plinthH / 2, -0.025]} castShadow receiveShadow>
              <boxGeometry args={[W - 0.01, plinthH, baseD - 0.05]} />
              <meshStandardMaterial color={spec.plinthColor} roughness={0.75} />
            </mesh>
          )}

          {Array.from({ length: count }).map((_, idx) => {
            const cx = -W / 2 + modW * (idx + 0.5);
            const mType = getModType(idx + moduleOffsetIdx);

            if (mType === 'sink') {
              return (
                <group key={`k-box-${idx}`} position={[cx, plinthH, 0]}>
                  <mesh position={[0, 0.009, 0]} castShadow receiveShadow>
                    <boxGeometry args={[modW, 0.018, baseD]} />
                    <meshStandardMaterial
                      key={`kc-sb-${corpusMat.map?.uuid ?? 'none'}`}
                      color={corpusMat.color}
                      map={corpusMat.map}
                      roughness={corpusMat.roughness}
                    />
                  </mesh>
                  <mesh position={[-modW / 2 + 0.009, baseBoxH / 2, 0]} castShadow receiveShadow>
                    <boxGeometry args={[0.018, baseBoxH, baseD]} />
                    <meshStandardMaterial
                      key={`kc-sl-${corpusMat.map?.uuid ?? 'none'}`}
                      color={corpusMat.color}
                      map={corpusMat.map}
                      roughness={corpusMat.roughness}
                    />
                  </mesh>
                  <mesh position={[modW / 2 - 0.009, baseBoxH / 2, 0]} castShadow receiveShadow>
                    <boxGeometry args={[0.018, baseBoxH, baseD]} />
                    <meshStandardMaterial
                      key={`kc-sr-${corpusMat.map?.uuid ?? 'none'}`}
                      color={corpusMat.color}
                      map={corpusMat.map}
                      roughness={corpusMat.roughness}
                    />
                  </mesh>
                </group>
              );
            }

            return (
              <mesh
                key={`k-box-${idx}`}
                position={[cx, plinthH + baseBoxH / 2, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[modW, baseBoxH, baseD]} />
                <meshStandardMaterial
                  key={`kc-base-${corpusMat.map?.uuid ?? 'none'}`}
                  color={corpusMat.color}
                  map={corpusMat.map}
                  roughness={corpusMat.roughness}
                />
              </mesh>
            );
          })}

          {spec.frontStyle === 'gola' && (
            <mesh position={[0, plinthH + baseBoxH - 0.015, baseD / 2 + 0.002]}>
              <boxGeometry args={[W, 0.028, 0.015]} />
              <meshStandardMaterial
                color={spec.handleColor}
                roughness={0.3}
                metalness={0.8}
              />
            </mesh>
          )}

          {Array.from({ length: count }).map((_, idx) => {
            const cx = -W / 2 + modW * (idx + 0.5);
            const mType = getModType(idx + moduleOffsetIdx);

            const countertopNode =
              mType === 'sink' ? (() => {
                const outerW = Math.min(0.76, Math.max(0.42, modW - 0.05));
                const outerD = Math.min(0.48, baseD - 0.12);
                const rim = 0.024;
                const holeW = outerW - rim;
                const holeD = outerD - rim;
                const holeZ = 0.015;
                const sideW = Math.max(0.01, (modW - holeW) / 2);
                const backD = Math.max(0.01, holeZ - holeD / 2 - -baseD / 2);
                const frontD = Math.max(
                  0.01,
                  baseD / 2 + overhang - (holeZ + holeD / 2)
                );

                return (
                  <group position={[cx, baseTotalH - topT / 2, 0]}>
                    <mesh
                      position={[0, 0, -baseD / 2 + backD / 2]}
                      castShadow
                      receiveShadow
                    >
                      <boxGeometry args={[modW + 0.002, topT, backD]} />
                      <meshStandardMaterial
                        key={`ktop-sb-${topMat.map?.uuid ?? 'none'}`}
                        color={topMat.color}
                        map={topMat.map}
                        roughness={topMat.roughness}
                        metalness={topMat.metalness}
                      />
                    </mesh>
                    <mesh
                      position={[0, 0, baseD / 2 + overhang - frontD / 2]}
                      castShadow
                      receiveShadow
                    >
                      <boxGeometry args={[modW + 0.002, topT, frontD]} />
                      <meshStandardMaterial
                        key={`ktop-sf-${topMat.map?.uuid ?? 'none'}`}
                        color={topMat.color}
                        map={topMat.map}
                        roughness={topMat.roughness}
                        metalness={topMat.metalness}
                      />
                    </mesh>
                    <mesh
                      position={[-modW / 2 + sideW / 2, 0, holeZ]}
                      castShadow
                      receiveShadow
                    >
                      <boxGeometry args={[sideW + 0.001, topT, holeD]} />
                      <meshStandardMaterial
                        key={`ktop-sl-${topMat.map?.uuid ?? 'none'}`}
                        color={topMat.color}
                        map={topMat.map}
                        roughness={topMat.roughness}
                        metalness={topMat.metalness}
                      />
                    </mesh>
                    <mesh
                      position={[modW / 2 - sideW / 2, 0, holeZ]}
                      castShadow
                      receiveShadow
                    >
                      <boxGeometry args={[sideW + 0.001, topT, holeD]} />
                      <meshStandardMaterial
                        key={`ktop-sr-${topMat.map?.uuid ?? 'none'}`}
                        color={topMat.color}
                        map={topMat.map}
                        roughness={topMat.roughness}
                        metalness={topMat.metalness}
                      />
                    </mesh>
                  </group>
                );
              })() : (
                <mesh
                  position={[cx, baseTotalH - topT / 2, topCenterZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[modW + 0.002, topT, totalTopD]} />
                  <meshStandardMaterial
                    key={`ktop-${idx}-${topMat.map?.uuid ?? 'none'}`}
                    color={topMat.color}
                    map={topMat.map}
                    roughness={topMat.roughness}
                    metalness={topMat.metalness}
                  />
                </mesh>
              );

            if (mType === 'drawers') {
              const h1 = baseBoxH * 0.24;
              const h2 = baseBoxH * 0.38;
              return (
                <group key={`k-mod-${idx}`}>
                  {countertopNode}
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={plinthH + h2 / 2}
                    z={baseD / 2 + 0.011}
                    width={modW}
                    height={h2}
                    frontStyle={spec.frontStyle}
                    handleStyle="horizontal"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isDrawer
                    isOpen={isOpen}
                  />
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={plinthH + h2 + h2 / 2}
                    z={baseD / 2 + 0.011}
                    width={modW}
                    height={h2}
                    frontStyle={spec.frontStyle}
                    handleStyle="horizontal"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isDrawer
                    isOpen={isOpen}
                  />
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={plinthH + h2 * 2 + h1 / 2}
                    z={baseD / 2 + 0.011}
                    width={modW}
                    height={h1}
                    frontStyle={spec.frontStyle}
                    handleStyle="horizontal"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isDrawer
                    isOpen={isOpen}
                  />
                </group>
              );
            }

            if (mType === 'oven') {
              const drawerH = 0.14;
              const ovenH = Math.max(0.45, baseBoxH - drawerH - 0.02);
              const hobW = Math.min(0.58, modW - 0.04);
              const hobD = baseD - 0.08;
              return (
                <group key={`k-mod-${idx}`}>
                  {countertopNode}
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={plinthH + drawerH / 2}
                    z={baseD / 2 + 0.011}
                    width={modW}
                    height={drawerH}
                    frontStyle={spec.frontStyle}
                    handleStyle="horizontal"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isDrawer
                    isOpen={isOpen}
                  />
                  <mesh
                    position={[cx, plinthH + drawerH + ovenH / 2, baseD / 2 + 0.012]}
                    castShadow
                  >
                    <boxGeometry args={[modW - 0.01, ovenH, 0.022]} />
                    <meshStandardMaterial
                      color="#0f172a"
                      roughness={0.2}
                      metalness={0.8}
                    />
                  </mesh>
                  <mesh
                    position={[cx, plinthH + drawerH + ovenH * 0.44, baseD / 2 + 0.024]}
                  >
                    <boxGeometry args={[modW - 0.09, ovenH * 0.62, 0.006]} />
                    <meshStandardMaterial
                      color="#1e293b"
                      roughness={0.1}
                      metalness={0.9}
                    />
                  </mesh>
                  <mesh
                    position={[cx, plinthH + drawerH + ovenH * 0.78, baseD / 2 + 0.036]}
                  >
                    <boxGeometry args={[modW - 0.08, 0.014, 0.022]} />
                    <meshStandardMaterial
                      color="#e2e8f0"
                      roughness={0.25}
                      metalness={0.55}
                    />
                  </mesh>
                  <mesh position={[cx, baseTotalH + 0.004, 0]}>
                    <boxGeometry args={[hobW, 0.008, hobD]} />
                    <meshStandardMaterial color="#090d16" roughness={0.12} metalness={0.5} />
                  </mesh>
                  {[
                    [-hobW * 0.24, -hobD * 0.22, 0.075],
                    [hobW * 0.24, -hobD * 0.22, 0.06],
                    [-hobW * 0.24, hobD * 0.22, 0.06],
                    [hobW * 0.24, hobD * 0.22, 0.08],
                  ].map(([bx, bz, r], bIdx) => (
                    <mesh
                      key={`hob-ring-${bIdx}`}
                      position={[cx + bx, baseTotalH + 0.009, bz]}
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      <ringGeometry args={[r - 0.008, r, 24]} />
                      <meshBasicMaterial color="#64748b" />
                    </mesh>
                  ))}
                </group>
              );
            }

            if (mType === 'sink') {
              return (
                <group key={`k-mod-${idx}`}>
                  {countertopNode}
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={plinthH + baseBoxH / 2}
                    z={baseD / 2 + 0.011}
                    width={modW}
                    height={baseBoxH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isOpen={isOpen}
                  />
                  <KitchenSinkAssembly
                    cx={cx}
                    topY={baseTotalH}
                    baseD={baseD}
                    modW={modW}
                  />
                </group>
              );
            }

            if (modW >= 0.78) {
              const halfW = modW / 2;
              return (
                <group key={`k-mod-${idx}`}>
                  {countertopNode}
                  <DoorOrDrawerLeaf
                    x={cx - halfW / 2}
                    y={plinthH + baseBoxH / 2}
                    z={baseD / 2 + 0.011}
                    width={halfW}
                    height={baseBoxH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide="left"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isOpen={isOpen}
                  />
                  <DoorOrDrawerLeaf
                    x={cx + halfW / 2}
                    y={plinthH + baseBoxH / 2}
                    z={baseD / 2 + 0.011}
                    width={halfW}
                    height={baseBoxH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide="right"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isOpen={isOpen}
                  />
                </group>
              );
            }

            return (
              <group key={`k-mod-${idx}`}>
                {countertopNode}
                <DoorOrDrawerLeaf
                  x={cx}
                  y={plinthH + baseBoxH / 2}
                  z={baseD / 2 + 0.011}
                  width={modW}
                  height={baseBoxH}
                  frontStyle={spec.frontStyle}
                  handleStyle={spec.handleStyle}
                  hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                  frontColor={frontMat.color}
                  frontMap={frontMat.map}
                  frontRoughness={frontMat.roughness}
                  frontMetalness={frontMat.metalness}
                  handleColor={spec.handleColor}
                  isOpen={isOpen}
                />
              </group>
            );
          })}
        </group>
      )}

      {spec.layoutMode === 'base-and-wall' && spec.hasBacksplash && (
        <mesh
          position={[
            isCornerWing ? cornerDir * (baseD / 2) : 0,
            baseTotalH + backsplashH / 2,
            -baseD / 2 + 0.008,
          ]}
          receiveShadow
        >
          <boxGeometry args={[isCornerWing ? W + baseD : W, backsplashH, 0.014]} />
          <meshStandardMaterial
            key={`kback-${backMat.map?.uuid ?? 'none'}`}
            color={backMat.color}
            map={backMat.map}
            roughness={backMat.roughness}
            metalness={backMat.metalness}
          />
        </mesh>
      )}

      {showWall && (
        <group position={[wallShiftX, wallStartY, wallZOffset]}>
          {/* Регулируема топла LED лента + реално осветяване върху термоплота */}
          {ledFactor > 0.01 && (
            <group>
              <mesh position={[0, -0.003, 0.015]}>
                <boxGeometry args={[wallTotalW - 0.04, 0.005, 0.018]} />
                <meshStandardMaterial
                  color="#fef3c7"
                  emissive="#fde68a"
                  emissiveIntensity={1.6 * ledFactor}
                  roughness={0.2}
                />
              </mesh>
              {Array.from({ length: ledLightCount }).map((_, lIdx) => {
                const lx =
                  -wallTotalW / 2 + (wallTotalW / ledLightCount) * (lIdx + 0.5);
                return (
                  <pointLight
                    key={`led-pt-${lIdx}`}
                    position={[lx, -0.06, 0.14]}
                    color="#fff3d6"
                    intensity={(1.6 * ledFactor) / ledLightCount}
                    distance={1.6}
                    decay={1.8}
                  />
                );
              })}
            </group>
          )}

          {Array.from({ length: wallModCount }).map((_, idx) => {
            const cx = -wallTotalW / 2 + wallModW * (idx + 0.5);
            const belowModType = !isCornerWing
              ? getModType(idx + moduleOffsetIdx)
              : 'doors';
            const isAboveOven = belowModType === 'oven';

            // 1) Декоративен комин-абсорбатор (светъл сив инокс)
            if (isAboveOven && hoodType === 'chimney') {
              const hoodW = Math.min(0.6, wallModW - 0.02);
              const hoodD = Math.min(0.46, baseD - 0.08);
              const visorH = 0.055;
              const chimneyH = Math.max(0.25, wallCabH - visorH);
              const zShift = (hoodD - wallCabD) / 2;

              return (
                <group key={`k-hood-${idx}`} position={[cx, 0, zShift]}>
                  <mesh position={[0, visorH / 2, 0]} castShadow receiveShadow>
                    <boxGeometry args={[hoodW, visorH, hoodD]} />
                    <meshStandardMaterial
                      color="#e2e8f0"
                      roughness={0.28}
                      metalness={0.45}
                    />
                  </mesh>
                  <mesh position={[0, 0.002, 0]}>
                    <boxGeometry args={[hoodW - 0.08, 0.004, hoodD - 0.08]} />
                    <meshStandardMaterial
                      color="#94a3b8"
                      roughness={0.45}
                      metalness={0.35}
                    />
                  </mesh>
                  <mesh
                    position={[0, visorH + chimneyH / 2, -hoodD / 2 + 0.13]}
                    castShadow
                    receiveShadow
                  >
                    <boxGeometry args={[0.26, chimneyH, 0.24]} />
                    <meshStandardMaterial
                      color="#e2e8f0"
                      roughness={0.28}
                      metalness={0.45}
                    />
                  </mesh>
                </group>
              );
            }

            // 2) Вграден телескопичен аспиратор — долният му ръб е на нивото на шкафовете (Y = 0)
            if (isAboveOven && hoodType === 'integrated') {
              const hoodBarH = 0.034; // 3.4 см челна иноксова лайстна
              const cabH = Math.max(0.3, wallCabH - hoodBarH);
              const yOffset = hoodBarH;

              return (
                <group key={`k-hood-int-${idx}`}>
                  {/* Шкаф над вградения аспиратор */}
                  <mesh
                    position={[cx, yOffset + cabH / 2, 0]}
                    castShadow
                    receiveShadow
                  >
                    <boxGeometry args={[wallModW, cabH, wallCabD]} />
                    <meshStandardMaterial
                      key={`kc-wh-${corpusMat.map?.uuid ?? 'none'}`}
                      color={corpusMat.color}
                      map={corpusMat.map}
                      roughness={corpusMat.roughness}
                    />
                  </mesh>

                  {/* Светъл сив инокс челен панел на аспиратора, подравнен точно на нивото на шкафовете */}
                  <mesh
                    position={[cx, hoodBarH / 2, 0.032]}
                    castShadow
                    receiveShadow
                  >
                    <boxGeometry args={[wallModW - 0.006, hoodBarH, wallCabD + 0.064]} />
                    <meshStandardMaterial
                      color="#e2e8f0"
                      roughness={0.28}
                      metalness={0.45}
                    />
                  </mesh>

                  {/* Алуминиев филтър отдолу */}
                  <mesh position={[cx, 0.002, 0.025]}>
                    <boxGeometry args={[wallModW - 0.07, 0.004, wallCabD + 0.02]} />
                    <meshStandardMaterial
                      color="#94a3b8"
                      roughness={0.45}
                      metalness={0.35}
                    />
                  </mesh>

                  <DoorOrDrawerLeaf
                    x={cx}
                    y={yOffset + cabH / 2}
                    z={wallCabD / 2 + 0.011}
                    width={wallModW}
                    height={cabH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isOpen={isOpen}
                  />
                </group>
              );
            }

            // 3) Стандартен горен шкаф
            return (
              <group key={`k-wall-mod-${idx}`}>
                <mesh
                  position={[cx, wallCabH / 2, 0]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallModW, wallCabH, wallCabD]} />
                  <meshStandardMaterial
                    key={`kc-wall-${idx}-${corpusMat.map?.uuid ?? 'none'}`}
                    color={corpusMat.color}
                    map={corpusMat.map}
                    roughness={corpusMat.roughness}
                  />
                </mesh>

                {wallModW >= 0.78 ? (
                  <>
                    <DoorOrDrawerLeaf
                      x={cx - wallModW / 4}
                      y={wallCabH / 2}
                      z={wallCabD / 2 + 0.011}
                      width={wallModW / 2}
                      height={wallCabH}
                      frontStyle={spec.frontStyle}
                      handleStyle={spec.handleStyle}
                      hingeSide="left"
                      frontColor={frontMat.color}
                      frontMap={frontMat.map}
                      frontRoughness={frontMat.roughness}
                      frontMetalness={frontMat.metalness}
                      handleColor={spec.handleColor}
                      isOpen={isOpen}
                    />
                    <DoorOrDrawerLeaf
                      x={cx + wallModW / 4}
                      y={wallCabH / 2}
                      z={wallCabD / 2 + 0.011}
                      width={wallModW / 2}
                      height={wallCabH}
                      frontStyle={spec.frontStyle}
                      handleStyle={spec.handleStyle}
                      hingeSide="right"
                      frontColor={frontMat.color}
                      frontMap={frontMat.map}
                      frontRoughness={frontMat.roughness}
                      frontMetalness={frontMat.metalness}
                      handleColor={spec.handleColor}
                      isOpen={isOpen}
                    />
                  </>
                ) : (
                  <DoorOrDrawerLeaf
                    x={cx}
                    y={wallCabH / 2}
                    z={wallCabD / 2 + 0.011}
                    width={wallModW}
                    height={wallCabH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                    isOpen={isOpen}
                  />
                )}
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}

function KitchenGeometry({
  spec,
  textures,
}: {
  spec: KitchenSpec;
  textures: CatalogTexture[];
}) {
  const W = Math.max(0.4, spec.widthCm / 100);
  const baseD = Math.max(0.45, spec.depthCm / 100);
  const plinthH = Math.max(0, Math.min(0.2, spec.plinthHeightCm / 100));
  const topT = Math.max(0.015, spec.countertopThicknessCm / 100);
  const overhang = Math.max(0, spec.countertopOverhangCm / 100);
  const baseTotalH = Math.max(0.65, spec.baseHeightCm / 100);
  const baseBoxH = Math.max(0.45, baseTotalH - plinthH - topT);

  const backsplashH = Math.max(0.3, spec.backsplashHeightCm / 100);
  const wallCabH = Math.max(0.35, spec.wallCabinetHeightCm / 100);
  const wallCabD = Math.max(0.25, spec.wallCabinetDepthCm / 100);
  const tallH = Math.max(1.6, spec.tallCabinetHeightCm / 100);

  const modCount = Math.max(1, Math.min(8, Math.round(spec.moduleCount)));
  const modW = W / modCount;
  const isOpen = Boolean(spec.doorsOpen);

  const corpusMat = useSimpleTexturedMaterial(
    spec.corpusColor,
    spec.corpusTextureId,
    textures,
    0.65,
    0.04
  );
  const frontMat = useSimpleTexturedMaterial(
    spec.frontColor,
    spec.frontTextureId,
    textures,
    0.42,
    0.05
  );
  const topMat = useSimpleTexturedMaterial(
    spec.countertopColor,
    spec.countertopTextureId,
    textures,
    0.35,
    0.08
  );
  const backMat = useSimpleTexturedMaterial(
    spec.backsplashColor,
    spec.backsplashTextureId,
    textures,
    0.4,
    0.05
  );

  if (spec.layoutMode === 'tall-column') {
    const colBodyH = Math.max(1.2, tallH - plinthH);
    const hasAppliances = spec.tallColumnAppliances ?? true;

    return (
      <group>
        {plinthH > 0.005 && (
          <mesh position={[0, plinthH / 2, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[W - 0.01, plinthH, baseD - 0.04]} />
            <meshStandardMaterial color={spec.plinthColor} roughness={0.7} />
          </mesh>
        )}
        <mesh position={[0, plinthH + colBodyH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[W, colBodyH, baseD]} />
          <meshStandardMaterial
            key={`kc-col-${corpusMat.map?.uuid ?? 'none'}`}
            color={corpusMat.color}
            map={corpusMat.map}
            roughness={corpusMat.roughness}
          />
        </mesh>
        {Array.from({ length: modCount }).map((_, idx) => {
          const cx = -W / 2 + modW * (idx + 0.5);
          const isApplianceSlot = hasAppliances && idx === 0;

          if (isApplianceSlot) {
            const lowerDoorH = colBodyH * 0.36;
            const ovenH = 0.56;
            const microH = 0.36;
            const upperDoorH = Math.max(0.25, colBodyH - lowerDoorH - ovenH - microH);

            return (
              <group key={`k-col-app-${idx}`}>
                <DoorOrDrawerLeaf
                  x={cx}
                  y={plinthH + lowerDoorH / 2}
                  z={baseD / 2 + 0.011}
                  width={modW}
                  height={lowerDoorH}
                  frontStyle={spec.frontStyle}
                  handleStyle={spec.handleStyle}
                  hingeSide="left"
                  frontColor={frontMat.color}
                  frontMap={frontMat.map}
                  frontRoughness={frontMat.roughness}
                  frontMetalness={frontMat.metalness}
                  handleColor={spec.handleColor}
                  isOpen={isOpen}
                />
                <mesh
                  position={[cx, plinthH + lowerDoorH + ovenH / 2, baseD / 2 + 0.012]}
                  castShadow
                >
                  <boxGeometry args={[modW - 0.015, ovenH - 0.01, 0.022]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.85} />
                </mesh>
                <mesh
                  position={[cx, plinthH + lowerDoorH + ovenH * 0.44, baseD / 2 + 0.024]}
                >
                  <boxGeometry args={[modW - 0.09, ovenH * 0.62, 0.006]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.9} />
                </mesh>
                <mesh
                  position={[cx, plinthH + lowerDoorH + ovenH + microH / 2, baseD / 2 + 0.012]}
                  castShadow
                >
                  <boxGeometry args={[modW - 0.015, microH - 0.01, 0.022]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.85} />
                </mesh>
                <mesh
                  position={[cx - 0.03, plinthH + lowerDoorH + ovenH + microH / 2, baseD / 2 + 0.024]}
                >
                  <boxGeometry args={[modW - 0.14, microH * 0.65, 0.006]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.9} />
                </mesh>
                <DoorOrDrawerLeaf
                  x={cx}
                  y={plinthH + lowerDoorH + ovenH + microH + upperDoorH / 2}
                  z={baseD / 2 + 0.011}
                  width={modW}
                  height={upperDoorH}
                  frontStyle={spec.frontStyle}
                  handleStyle={spec.handleStyle}
                  hingeSide="left"
                  frontColor={frontMat.color}
                  frontMap={frontMat.map}
                  frontRoughness={frontMat.roughness}
                  frontMetalness={frontMat.metalness}
                  handleColor={spec.handleColor}
                  isOpen={isOpen}
                />
              </group>
            );
          }

          const lowerH = colBodyH * 0.42;
          const upperH = colBodyH - lowerH;
          return (
            <group key={`k-col-${idx}`}>
              <DoorOrDrawerLeaf
                x={cx}
                y={plinthH + lowerH / 2}
                z={baseD / 2 + 0.011}
                width={modW}
                height={lowerH}
                frontStyle={spec.frontStyle}
                handleStyle={spec.handleStyle}
                hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                frontColor={frontMat.color}
                frontMap={frontMat.map}
                frontRoughness={frontMat.roughness}
                frontMetalness={frontMat.metalness}
                handleColor={spec.handleColor}
                isOpen={isOpen}
              />
              <DoorOrDrawerLeaf
                x={cx}
                y={plinthH + lowerH + upperH / 2}
                z={baseD / 2 + 0.011}
                width={modW}
                height={upperH}
                frontStyle={spec.frontStyle}
                handleStyle={spec.handleStyle}
                hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                frontColor={frontMat.color}
                frontMap={frontMat.map}
                frontRoughness={frontMat.roughness}
                frontMetalness={frontMat.metalness}
                handleColor={spec.handleColor}
                isOpen={isOpen}
              />
            </group>
          );
        })}
      </group>
    );
  }

  const shape = spec.shape ?? 'straight';
  const hasLWing = shape === 'l-left' || shape === 'l-right';
  const wingTotalW = Math.max(baseD + 0.4, (spec.wingWidthCm ?? 160) / 100);
  const netWingLen = Math.max(0.4, wingTotalW - baseD);
  const wingMods = Math.max(1, Math.min(6, spec.wingModuleCount ?? 2));

  return (
    <group>
      <KitchenRunSegment
        widthM={W}
        baseD={baseD}
        plinthH={plinthH}
        topT={topT}
        overhang={overhang}
        baseTotalH={baseTotalH}
        baseBoxH={baseBoxH}
        backsplashH={backsplashH}
        wallCabH={wallCabH}
        wallCabD={wallCabD}
        modCount={modCount}
        moduleOffsetIdx={0}
        spec={spec}
        corpusMat={corpusMat}
        frontMat={frontMat}
        topMat={topMat}
        backMat={backMat}
      />

      {hasLWing && shape === 'l-left' && (
        <group
          position={[-W / 2 + baseD / 2, 0, baseD / 2 + netWingLen / 2]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <KitchenRunSegment
            widthM={netWingLen}
            baseD={baseD}
            plinthH={plinthH}
            topT={topT}
            overhang={overhang}
            baseTotalH={baseTotalH}
            baseBoxH={baseBoxH}
            backsplashH={backsplashH}
            wallCabH={wallCabH}
            wallCabD={wallCabD}
            modCount={wingMods}
            moduleOffsetIdx={modCount}
            spec={spec}
            corpusMat={corpusMat}
            frontMat={frontMat}
            topMat={topMat}
            backMat={backMat}
            isCornerWing
            cornerSide="l-left"
          />
        </group>
      )}

      {hasLWing && shape === 'l-right' && (
        <group
          position={[W / 2 - baseD / 2, 0, baseD / 2 + netWingLen / 2]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <KitchenRunSegment
            widthM={netWingLen}
            baseD={baseD}
            plinthH={plinthH}
            topT={topT}
            overhang={overhang}
            baseTotalH={baseTotalH}
            baseBoxH={baseBoxH}
            backsplashH={backsplashH}
            wallCabH={wallCabH}
            wallCabD={wallCabD}
            modCount={wingMods}
            moduleOffsetIdx={modCount}
            spec={spec}
            corpusMat={corpusMat}
            frontMat={frontMat}
            topMat={topMat}
            backMat={backMat}
            isCornerWing
            cornerSide="l-right"
          />
        </group>
      )}
    </group>
  );
}

export function ParametricFurnitureMesh({
  item,
  config,
  textures,
  walls = [],
  isSelected,
  transformTool,
  onSelect,
  onTransformChange,
  onDraggingChange,
}: ParametricFurnitureMeshProps) {
  const [targetObj, setTargetObj] = useState<THREE.Object3D | null>(null);
  const [wallGuides, setWallGuides] = useState<WallDistanceGuide[]>([]);
  const isDraggingRef = useRef(false);

  const snapDims = useMemo(() => {
    const sx = Math.abs(item.scale[0] || 1);
    const sz = Math.abs(item.scale[2] || 1);

    if (config.kind === 'wardrobe' && config.wardrobe) {
      return {
        halfWidthM: ((config.wardrobe.widthCm / 100) * sx) / 2,
        backOffsetM: ((config.wardrobe.depthCm / 100) * sz) / 2,
        lWingSide: null as 'left' | 'right' | null,
        lWingLengthM: 0,
      };
    }
    if (config.kind === 'kitchen' && config.kitchen) {
      const shape = config.kitchen.shape ?? 'straight';
      const rawWingSide: 'left' | 'right' | null =
        shape === 'l-left' ? 'left' : shape === 'l-right' ? 'right' : null;
      const effectiveWingSide: 'left' | 'right' | null =
        rawWingSide && item.mirrored
          ? rawWingSide === 'left'
            ? 'right'
            : 'left'
          : rawWingSide;

      return {
        halfWidthM: ((config.kitchen.widthCm / 100) * sx) / 2,
        backOffsetM: ((config.kitchen.depthCm / 100) * sz) / 2,
        lWingSide: effectiveWingSide,
        lWingLengthM: effectiveWingSide
          ? ((config.kitchen.wingWidthCm ?? 160) / 100) * sz
          : 0,
      };
    }
    return {
      halfWidthM: 0.6,
      backOffsetM: 0.3,
      lWingSide: null as 'left' | 'right' | null,
      lWingLengthM: 0,
    };
  }, [config, item.scale, item.mirrored]);

  useEffect(() => {
    if (!targetObj || isDraggingRef.current) return;
    targetObj.position.set(item.position[0], item.position[1], item.position[2]);
    targetObj.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    const sx = item.mirrored ? -Math.abs(item.scale[0]) : Math.abs(item.scale[0]);
    targetObj.scale.set(sx, item.scale[1], item.scale[2]);
  }, [targetObj, item.position, item.rotation, item.scale, item.mirrored]);

  const handleDragChange = () => {
    if (!targetObj) return;
    if (targetObj.position.y < 0) {
      targetObj.position.y = 0;
    }

    if (transformTool === 'translate' && walls.length > 0) {
      const snapped = snapFurnitureToWalls(
        [targetObj.position.x, targetObj.position.y, targetObj.position.z],
        targetObj.rotation.y,
        walls,
        {
          backOffsetM: snapDims.backOffsetM,
          halfWidthM: snapDims.halfWidthM,
          lWingSide: snapDims.lWingSide,
          lWingLengthM: snapDims.lWingLengthM,
          snapDistanceM: 0.34,
        }
      );

      if (snapped.snapped) {
        targetObj.position.x = snapped.position[0];
        targetObj.position.z = snapped.position[2];
        targetObj.rotation.y = snapped.rotationY;
      }

      if (isDraggingRef.current) {
        setWallGuides(snapped.guides);
      }
    }
  };

  return (
    <>
      <group
        ref={setTargetObj}
        position={item.position}
        rotation={item.rotation}
        scale={[
          item.mirrored ? -Math.abs(item.scale[0]) : Math.abs(item.scale[0]),
          item.scale[1],
          item.scale[2],
        ]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 4) return;
          onSelect(item.instanceId);
        }}
      >
        {config.kind === 'wardrobe' && config.wardrobe ? (
          <WardrobeGeometry spec={config.wardrobe} textures={textures} />
        ) : config.kind === 'kitchen' && config.kitchen ? (
          <KitchenGeometry spec={config.kitchen} textures={textures} />
        ) : null}
      </group>

      {isSelected && wallGuides.length > 0 && (
        <FurnitureWallGuides guides={wallGuides} />
      )}

      {isSelected && targetObj && (
        <TransformControls
          object={targetObj}
          mode={transformTool}
          showY={transformTool !== 'translate'}
          onMouseDown={() => {
            isDraggingRef.current = true;
            onDraggingChange(true);
          }}
          onObjectChange={handleDragChange}
          onMouseUp={() => {
            isDraggingRef.current = false;
            onDraggingChange(false);
            setWallGuides([]);
            if (!targetObj) return;
            handleDragChange();
            onTransformChange(
              item.instanceId,
              [
                Number(targetObj.position.x.toFixed(3)),
                Number(targetObj.position.y.toFixed(3)),
                Number(targetObj.position.z.toFixed(3)),
              ],
              [
                Number(targetObj.rotation.x.toFixed(4)),
                Number(targetObj.rotation.y.toFixed(4)),
                Number(targetObj.rotation.z.toFixed(4)),
              ],
              [
                Number(Math.abs(targetObj.scale.x).toFixed(3)),
                Number(targetObj.scale.y.toFixed(3)),
                Number(targetObj.scale.z.toFixed(3)),
              ]
            );
          }}
        />
      )}
    </>
  );
}