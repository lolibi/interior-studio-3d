import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
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

export interface ParametricFurnitureMeshProps {
  item: SceneObject;
  config: ParametricFurnitureConfig;
  textures: CatalogTexture[];
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
}: DoorLeafProps) {
  const gap = 0.004;
  const w = Math.max(0.06, width - gap);
  const h = Math.max(0.06, height - gap);
  const frameBorder = Math.min(0.055, w * 0.16, h * 0.16);

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

    // vertical handle
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

  return (
    <group position={[x, y, z]}>
      {frontStyle === 'shaker' && w > 0.16 && h > 0.16 ? (
        <>
          {/* Вътрешна табла */}
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
          {/* Лява и дясна рамка */}
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
          {/* Горна и долна рамка */}
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
  const drawerRows =
    spec.doorType === 'hinged'
      ? Math.max(0, Math.min(4, Math.round(spec.bottomDrawersCount)))
      : 0;
  const drawerZoneH = drawerRows * 0.19;
  const upperDoorH = Math.max(0.4, mainBodyH - drawerZoneH);

  return (
    <group>
      {/* Цокъл */}
      {plinthH > 0.005 && (
        <mesh position={[0, plinthH / 2, -0.015]} castShadow receiveShadow>
          <boxGeometry args={[W - 0.01, plinthH, D - 0.03]} />
          <meshStandardMaterial color={spec.plinthColor} roughness={0.7} />
        </mesh>
      )}

      {/* Основен корпус */}
      <group position={[0, plinthH, 0]}>
        {/* Дъно и таван на корпуса */}
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

        {/* Страници + вътрешни делители */}
        {Array.from({ length: doors + 1 }).map((_, idx) => {
          const isOuter = idx === 0 || idx === doors;
          const px = -W / 2 + idx * doorW + (idx === 0 ? panelT / 2 : idx === doors ? -panelT / 2 : 0);
          return (
            <mesh
              key={`w-div-${idx}`}
              position={[px, mainBodyH / 2, isOuter ? 0 : -0.01]}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={[panelT, mainBodyH - panelT * 2, isOuter ? D : D - 0.025]}
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

        {/* Гръб */}
        <mesh position={[0, mainBodyH / 2, -D / 2 + 0.004]}>
          <boxGeometry args={[W - 0.006, mainBodyH - 0.006, 0.006]} />
          <meshStandardMaterial color={spec.corpusColor} roughness={0.85} />
        </mesh>

        {/* Врати и чекмеджета */}
        {Array.from({ length: doors }).map((_, idx) => {
          const cx = -W / 2 + doorW * (idx + 0.5);
          const isSliding = spec.doorType === 'sliding';
          const zOffset = isSliding
            ? D / 2 + (idx % 2 === 0 ? 0.026 : 0.006)
            : D / 2 + 0.011;
          const actualDoorW = isSliding ? doorW + 0.03 : doorW;

          return (
            <group key={`w-sec-${idx}`}>
              {/* Долни чекмеджета (само при отваряеми врати) */}
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
                />
              ))}

              {/* Основно крило */}
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
              />
            </group>
          );
        })}
      </group>

      {/* Надстройка (Bridge) */}
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
            />
          ))}
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

  const getModType = (idx: number): KitchenModuleType =>
    spec.modulePattern[idx % spec.modulePattern.length] ?? 'doors';

  if (spec.layoutMode === 'tall-column') {
    const colBodyH = Math.max(1.2, tallH - plinthH);
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
              />
            </group>
          );
        })}
      </group>
    );
  }

  const showBase =
    spec.layoutMode === 'base-only' || spec.layoutMode === 'base-and-wall';
  const showWall =
    spec.layoutMode === 'wall-only' || spec.layoutMode === 'base-and-wall';

  const wallStartY =
    spec.layoutMode === 'wall-only' ? 1.45 : baseTotalH + backsplashH;
  const wallZOffset = -baseD / 2 + wallCabD / 2;

  return (
    <group>
      {/* ДОЛЕН РЕД ШКАФОВЕ + ПЛОТ */}
      {showBase && (
        <group>
          {plinthH > 0.005 && (
            <mesh position={[0, plinthH / 2, -0.025]} castShadow receiveShadow>
              <boxGeometry args={[W - 0.01, plinthH, baseD - 0.05]} />
              <meshStandardMaterial color={spec.plinthColor} roughness={0.75} />
            </mesh>
          )}

          {/* Корпус долен ред */}
          <mesh position={[0, plinthH + baseBoxH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[W, baseBoxH, baseD]} />
            <meshStandardMaterial
              key={`kc-base-${corpusMat.map?.uuid ?? 'none'}`}
              color={corpusMat.color}
              map={corpusMat.map}
              roughness={corpusMat.roughness}
            />
          </mesh>

          {/* Gola профил лента под плота */}
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

          {/* Модули на долния ред */}
          {Array.from({ length: modCount }).map((_, idx) => {
            const cx = -W / 2 + modW * (idx + 0.5);
            const mType = getModType(idx);

            if (mType === 'drawers') {
              const h1 = baseBoxH * 0.24;
              const h2 = baseBoxH * 0.38;
              return (
                <group key={`k-mod-${idx}`}>
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
                  />
                </group>
              );
            }

            if (mType === 'oven') {
              const drawerH = 0.14;
              const ovenH = Math.max(0.45, baseBoxH - drawerH - 0.02);
              return (
                <group key={`k-mod-${idx}`}>
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
                  />
                  {/* Корпус фурна */}
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
                  {/* Стъкло фурна */}
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
                  {/* Дръжка фурна */}
                  <mesh
                    position={[cx, plinthH + drawerH + ovenH * 0.78, baseD / 2 + 0.036]}
                  >
                    <boxGeometry args={[modW - 0.08, 0.014, 0.022]} />
                    <meshStandardMaterial
                      color="#cbd5e1"
                      roughness={0.25}
                      metalness={0.85}
                    />
                  </mesh>
                  {/* Керамичен плот котлони отгоре */}
                  <mesh
                    position={[cx, baseTotalH + 0.004, 0]}
                  >
                    <boxGeometry args={[Math.min(0.58, modW - 0.04), 0.008, baseD - 0.08]} />
                    <meshStandardMaterial color="#090d16" roughness={0.12} metalness={0.5} />
                  </mesh>
                </group>
              );
            }

            if (mType === 'sink') {
              return (
                <group key={`k-mod-${idx}`}>
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
                  />
                  {/* Корито мивка */}
                  <mesh position={[cx, baseTotalH + 0.003, 0.01]}>
                    <boxGeometry args={[Math.min(0.56, modW - 0.06), 0.008, baseD - 0.14]} />
                    <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
                  </mesh>
                  {/* Смесител (батерия) */}
                  <mesh position={[cx, baseTotalH + 0.14, -baseD / 2 + 0.09]} castShadow>
                    <cylinderGeometry args={[0.012, 0.016, 0.28, 12]} />
                    <meshStandardMaterial color="#cbd5e1" roughness={0.2} metalness={0.9} />
                  </mesh>
                  <mesh
                    position={[cx, baseTotalH + 0.27, -baseD / 2 + 0.15]}
                    rotation={[Math.PI / 2.4, 0, 0]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.009, 0.009, 0.15, 12]} />
                    <meshStandardMaterial color="#cbd5e1" roughness={0.2} metalness={0.9} />
                  </mesh>
                </group>
              );
            }

            // doors (2 вратички при широк модул >= 80см, 1 врата при тесен)
            if (modW >= 0.78) {
              const halfW = modW / 2;
              return (
                <group key={`k-mod-${idx}`}>
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
                  />
                </group>
              );
            }

            return (
              <DoorOrDrawerLeaf
                key={`k-mod-${idx}`}
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
              />
            );
          })}

          {/* Непрекъснат термоплот */}
          <mesh
            position={[0, baseTotalH - topT / 2, overhang / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W + 0.004, topT, baseD + overhang]} />
            <meshStandardMaterial
              key={`ktop-${topMat.map?.uuid ?? 'none'}`}
              color={topMat.color}
              map={topMat.map}
              roughness={topMat.roughness}
              metalness={topMat.metalness}
            />
          </mesh>
        </group>
      )}

      {/* ТЕРМОГРЪБ (ВОДОБРАННА СТЕНА) */}
      {spec.layoutMode === 'base-and-wall' && spec.hasBacksplash && (
        <mesh
          position={[0, baseTotalH + backsplashH / 2, -baseD / 2 + 0.008]}
          receiveShadow
        >
          <boxGeometry args={[W, backsplashH, 0.014]} />
          <meshStandardMaterial
            key={`kback-${backMat.map?.uuid ?? 'none'}`}
            color={backMat.color}
            map={backMat.map}
            roughness={backMat.roughness}
            metalness={backMat.metalness}
          />
        </mesh>
      )}

      {/* ГОРЕН РЕД ШКАФОВЕ */}
      {showWall && (
        <group position={[0, wallStartY, wallZOffset]}>
          <mesh position={[0, wallCabH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[W, wallCabH, wallCabD]} />
            <meshStandardMaterial
              key={`kc-wall-${corpusMat.map?.uuid ?? 'none'}`}
              color={corpusMat.color}
              map={corpusMat.map}
              roughness={corpusMat.roughness}
            />
          </mesh>

          {Array.from({ length: modCount }).map((_, idx) => {
            const cx = -W / 2 + modW * (idx + 0.5);
            if (modW >= 0.78) {
              const halfW = modW / 2;
              return (
                <group key={`k-wall-${idx}`}>
                  <DoorOrDrawerLeaf
                    x={cx - halfW / 2}
                    y={wallCabH / 2}
                    z={wallCabD / 2 + 0.011}
                    width={halfW}
                    height={wallCabH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide="left"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                  />
                  <DoorOrDrawerLeaf
                    x={cx + halfW / 2}
                    y={wallCabH / 2}
                    z={wallCabD / 2 + 0.011}
                    width={halfW}
                    height={wallCabH}
                    frontStyle={spec.frontStyle}
                    handleStyle={spec.handleStyle}
                    hingeSide="right"
                    frontColor={frontMat.color}
                    frontMap={frontMat.map}
                    frontRoughness={frontMat.roughness}
                    frontMetalness={frontMat.metalness}
                    handleColor={spec.handleColor}
                  />
                </group>
              );
            }

            return (
              <DoorOrDrawerLeaf
                key={`k-wall-${idx}`}
                x={cx}
                y={wallCabH / 2}
                z={wallCabD / 2 + 0.011}
                width={modW}
                height={wallCabH}
                frontStyle={spec.frontStyle}
                handleStyle={spec.handleStyle}
                hingeSide={idx % 2 === 0 ? 'left' : 'right'}
                frontColor={frontMat.color}
                frontMap={frontMat.map}
                frontRoughness={frontMat.roughness}
                frontMetalness={frontMat.metalness}
                handleColor={spec.handleColor}
              />
            );
          })}
        </group>
      )}
    </group>
  );
}

export function ParametricFurnitureMesh({
  item,
  config,
  textures,
  isSelected,
  transformTool,
  onSelect,
  onTransformChange,
  onDraggingChange,
}: ParametricFurnitureMeshProps) {
  const [targetObj, setTargetObj] = useState<THREE.Object3D | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!targetObj || isDraggingRef.current) return;
    targetObj.position.set(item.position[0], item.position[1], item.position[2]);
    targetObj.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    const sx = item.mirrored ? -Math.abs(item.scale[0]) : Math.abs(item.scale[0]);
    targetObj.scale.set(sx, item.scale[1], item.scale[2]);
  }, [targetObj, item.position, item.rotation, item.scale, item.mirrored]);

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

      {isSelected && targetObj && (
        <TransformControls
          object={targetObj}
          mode={transformTool}
          showY={transformTool !== 'translate'}
          onMouseDown={() => {
            isDraggingRef.current = true;
            onDraggingChange(true);
          }}
          onMouseUp={() => {
            isDraggingRef.current = false;
            onDraggingChange(false);
            if (!targetObj) return;
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