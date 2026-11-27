export type EditorTool = 'select' | 'move' | 'rotate' | 'scale';
export type TransformTool = 'translate' | 'rotate' | 'scale';
export type PlacementMode = 'free' | 'wall' | 'grid';
export type ScaleMode = 'fixed' | 'constrained' | 'free';
export type DisplayUnit = 'm' | 'cm';

export interface DimensionsCm {
  width: number;
  height: number;
  depth: number;
}

export interface ScaleConstraints {
  allowX: boolean;
  allowY: boolean;
  allowZ: boolean;
  minCm: DimensionsCm;
  maxCm: DimensionsCm;
}

export interface CatalogCategoryItem {
  id: string;
  slug: string;
  name: string;
  scope: 'model' | 'texture';
  sortOrder?: number;
  snapToWall?: boolean;
}

export interface CatalogModel {
  id: string;
  name: string;
  sku?: string;
  category: string;
  color?: string;
  material?: string;
  style?: string;
  tags?: string[];
  dimensionsCm: DimensionsCm;
  scaleMode: ScaleMode;
  scaleConstraints?: ScaleConstraints;
  glbUrl?: string;
  previewUrl?: string;
  isActive: boolean;
  isPremium?: boolean;
}

export type CreateModelInput = Omit<CatalogModel, 'id'>;

export interface CatalogTexture {
  id: string;
  name: string;
  sku?: string;
  category: string;
  color?: string;
  finish?: string;
  tags?: string[];
  mapUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  tileWidthM: number;
  tileHeightM: number;
  roughness?: number;
  metalness?: number;
  isActive?: boolean;
  isPremium?: boolean;
}

export type CreateTextureInput = Omit<CatalogTexture, 'id'>;

export interface MaterialOverride {
  color?: string;
  textureId?: string;
  roughness?: number;
  metalness?: number;
}

export type ParametricFurnitureKind = 'wardrobe' | 'kitchen';
export type WardrobeDoorOpeningType = 'hinged' | 'sliding';
export type WardrobeInteriorLayout = 'mixed' | 'shelves-only' | 'rail-and-shelves';
export type FrontStyleType = 'flat' | 'shaker' | 'gola';
export type HandleStyleType = 'bar' | 'vertical' | 'horizontal' | 'knob' | 'none';
export type KitchenShapeType = 'straight' | 'l-left' | 'l-right';
export type KitchenLayoutMode = 'base-and-wall' | 'base-only' | 'wall-only' | 'tall-column';
export type KitchenModuleType = 'doors' | 'drawers' | 'oven' | 'sink';
export type KitchenHoodType = 'chimney' | 'integrated' | 'none';

export interface WardrobeSpec {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  plinthHeightCm: number;
  plinthColor: string;
  hasTopBridge: boolean;
  topBridgeHeightCm: number;
  doorCount: number;
  doorType: WardrobeDoorOpeningType;
  mirrorDoorIndices?: number[];
  bottomDrawersCount: number;
  interiorLayout?: WardrobeInteriorLayout;
  doorsOpen?: boolean;
  corpusColor: string;
  corpusTextureId?: string | null;
  frontColor: string;
  frontTextureId?: string | null;
  frontStyle: FrontStyleType;
  handleStyle: HandleStyleType;
  handleColor: string;
}

export interface KitchenSpec {
  widthCm: number;
  depthCm: number;
  baseHeightCm: number;
  plinthHeightCm: number;
  plinthColor: string;
  countertopThicknessCm: number;
  countertopColor: string;
  countertopTextureId?: string | null;
  wallCabinetHeightCm: number;
  wallCabinetDepthCm: number;
  backsplashHeightCm: number;
  backsplashColor: string;
  backsplashTextureId?: string | null;
  shape: KitchenShapeType;
  wingWidthCm?: number;
  moduleCount: number;
  wingModuleCount?: number;
  layoutMode: KitchenLayoutMode;
  tallCabinetHeightCm: number;
  tallColumnAppliances?: boolean;
  modulePattern: KitchenModuleType[];
  hoodType?: KitchenHoodType;
  doorsOpen?: boolean;
  corpusColor: string;
  corpusTextureId?: string | null;
  frontColor: string;
  frontTextureId?: string | null;
  frontStyle: FrontStyleType;
  handleStyle: HandleStyleType;
  handleColor: string;
  hasUnderCabinetLed?: boolean;
  ledIntensity?: number;
}

export interface ParametricFurnitureConfig {
  kind: ParametricFurnitureKind;
  wardrobe?: WardrobeSpec;
  kitchen?: KitchenSpec;
}

export type ParametricObjectData = ParametricFurnitureConfig;

export interface PlacedObject {
  id?: string;
  instanceId: string;
  modelId: string;
  name?: string;
  category?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mirrored?: boolean;
  dimensionsCm?: DimensionsCm;
  scaleMode?: ScaleMode;
  scaleConstraints?: ScaleConstraints;
  glbUrl?: string;
  colorOverride?: string;
  textureOverrideId?: string;
  materialOverrides?: Record<string, MaterialOverride>;
  parametric?: ParametricFurnitureConfig;
}

export type SceneObject = PlacedObject;

export interface LegacyRoomConfig {
  widthM?: number;
  depthM?: number;
  heightM?: number;
  floorColor?: string;
  wallColor?: string;
  floorTextureId?: string;
  wallTextureId?: string;
}

export interface SavedScene {
  version?: number;
  savedAt?: string;
  id?: string;
  title?: string;
  objects: PlacedObject[];
  room: any;
}

export const WALL_SNAP_CATEGORIES: string[] = [
  'sofas',
  'wardrobes',
  'kitchen',
  'beds',
  'cabinets',
  'tv-units',
];

export const DEFAULT_WARDROBE_SPEC: WardrobeSpec = {
  widthCm: 180,
  heightCm: 220,
  depthCm: 60,
  plinthHeightCm: 8,
  plinthColor: '#cbd5e1',
  hasTopBridge: false,
  topBridgeHeightCm: 45,
  doorCount: 3,
  doorType: 'hinged',
  mirrorDoorIndices: [1],
  bottomDrawersCount: 0,
  interiorLayout: 'mixed',
  doorsOpen: false,
  corpusColor: '#e2e8f0',
  corpusTextureId: null,
  frontColor: '#f8fafc',
  frontTextureId: null,
  frontStyle: 'flat',
  handleStyle: 'vertical',
  handleColor: '#0f172a',
};

export const DEFAULT_KITCHEN_SPEC: KitchenSpec = {
  widthCm: 240,
  depthCm: 60,
  baseHeightCm: 85,
  plinthHeightCm: 10,
  plinthColor: '#334155',
  countertopThicknessCm: 4,
  countertopColor: '#cbd5e1',
  countertopTextureId: null,
  wallCabinetHeightCm: 72,
  wallCabinetDepthCm: 34,
  backsplashHeightCm: 60,
  backsplashColor: '#e2e8f0',
  backsplashTextureId: null,
  shape: 'straight',
  wingWidthCm: 160,
  moduleCount: 4,
  wingModuleCount: 2,
  layoutMode: 'base-and-wall',
  tallCabinetHeightCm: 215,
  tallColumnAppliances: true,
  modulePattern: ['doors', 'drawers', 'oven', 'sink'],
  hoodType: 'chimney',
  doorsOpen: false,
  corpusColor: '#f1f5f9',
  corpusTextureId: null,
  frontColor: '#f8fafc',
  frontTextureId: null,
  frontStyle: 'flat',
  handleStyle: 'horizontal',
  handleColor: '#0f172a',
  hasUnderCabinetLed: true,
  ledIntensity: 100,
};

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  sofas: 'Дивани',
  armchairs: 'Фотьойли',
  tables: 'Маси',
  chairs: 'Столове',
  beds: 'Легла',
  wardrobes: 'Гардероби',
  kitchen: 'Кухня',
  lighting: 'Осветление',
  decor: 'Декорация',
  other: 'Други',
};

export const DEFAULT_TEXTURE_CATEGORY_LABELS: Record<string, string> = {
  floor: 'Подове',
  wall: 'Стени',
  wood: 'Дървесина',
  stone: 'Камък и мрамор',
  fabric: 'Текстил и дамаски',
  metal: 'Метали',
  other: 'Други',
};