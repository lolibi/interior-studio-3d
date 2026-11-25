import type { RoomConfig } from './room';

export type ModelCategory =
  | 'sofas'
  | 'armchairs'
  | 'chairs'
  | 'tables'
  | 'beds'
  | 'wardrobes'
  | 'kitchen'
  | 'lighting'
  | 'bathroom'
  | 'decor'
  | 'doors'
  | 'windows';

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  sofas: 'Дивани',
  armchairs: 'Фотьойли',
  chairs: 'Столове',
  tables: 'Маси',
  beds: 'Легла',
  wardrobes: 'Гардероби и шкафове',
  kitchen: 'Кухня',
  lighting: 'Осветление',
  bathroom: 'Баня',
  decor: 'Декор',
  doors: 'Врати',
  windows: 'Прозорци',
};

/** Категории мебели, които се снапват магнитно към стените и ъглите */
export const WALL_SNAP_CATEGORIES: ModelCategory[] = [
  'wardrobes',
  'kitchen',
  'decor',
  'bathroom',
  'doors',
  'windows',
];

export type ScaleMode = 'fixed' | 'constrained' | 'free';
export type TransformTool = 'translate' | 'rotate' | 'scale';
export type DisplayUnit = 'cm' | 'm';

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

export interface MaterialOverride {
  color: string;
  textureId?: string | null;
  roughness?: number;
  metalness?: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  category: ModelCategory;
  glbUrl?: string;
  glbFileKey?: string;
  previewUrl?: string;
  dimensionsCm: DimensionsCm;
  scaleMode: ScaleMode;
  scaleConstraints: ScaleConstraints;
  colorHex?: string;
  isActive: boolean;
  isBuiltIn?: boolean;
  isCustomPreset?: boolean;
  defaultMaterialOverrides?: Record<string, MaterialOverride>;
}

export interface CreateModelInput {
  name: string;
  category: ModelCategory;
  glbUrl?: string;
  previewUrl?: string;
  dimensionsCm: DimensionsCm;
  scaleMode: ScaleMode;
  scaleConstraints: ScaleConstraints;
  colorHex?: string;
  isActive: boolean;
}

export type TextureCategory = 'wall' | 'floor' | 'tiles' | 'furniture';

export const TEXTURE_CATEGORY_LABELS: Record<TextureCategory, string> = {
  wall: 'Стени / Тапети',
  floor: 'Подове / Паркет',
  tiles: 'Плочки / Гранитогрес',
  furniture: 'Мебели / Текстил',
};

export interface CatalogTexture {
  id: string;
  name: string;
  category: TextureCategory;
  mapUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  tileWidthM: number;
  tileHeightM: number;
  roughness?: number;
  metalness?: number;
  isActive?: boolean;
}

export interface CreateTextureInput {
  name: string;
  category: TextureCategory;
  mapUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  tileWidthM: number;
  tileHeightM: number;
  roughness?: number;
  metalness?: number;
  isActive?: boolean;
}

/* ============================================================================
   ПАРАМЕТРИЧЕН ГЕНЕРАТОР ЗА ГАРДЕРОБИ И КУХНИ
   ============================================================================ */

export type ParametricFurnitureKind = 'wardrobe' | 'kitchen';
export type FrontStyleType = 'flat' | 'shaker' | 'gola';
export type HandleStyleType = 'vertical' | 'horizontal' | 'knob' | 'none';
export type WardrobeDoorOpeningType = 'hinged' | 'sliding';
export type KitchenShapeType = 'straight' | 'l-left' | 'l-right';
export type KitchenLayoutMode =
  | 'base-only'
  | 'base-and-wall'
  | 'wall-only'
  | 'tall-column';
export type KitchenModuleType = 'doors' | 'drawers' | 'oven' | 'sink';

export interface WardrobeSpec {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  doorCount: number;
  doorType: WardrobeDoorOpeningType;
  mirrorDoorIndices?: number[];
  plinthHeightCm: number;
  hasTopBridge: boolean;
  topBridgeHeightCm: number;
  bottomDrawersCount: number;
  frontStyle: FrontStyleType;
  handleStyle: HandleStyleType;
  corpusColor: string;
  corpusTextureId?: string | null;
  frontColor: string;
  frontTextureId?: string | null;
  handleColor: string;
  plinthColor: string;
}

export interface KitchenSpec {
  shape?: KitchenShapeType;
  widthCm: number;
  wingWidthCm?: number;
  wingModuleCount?: number;
  depthCm: number;
  layoutMode: KitchenLayoutMode;
  baseHeightCm: number;
  plinthHeightCm: number;
  countertopThicknessCm: number;
  countertopOverhangCm: number;
  hasBacksplash: boolean;
  backsplashHeightCm: number;
  wallCabinetHeightCm: number;
  wallCabinetDepthCm: number;
  tallCabinetHeightCm: number;
  moduleCount: number;
  modulePattern: KitchenModuleType[];
  frontStyle: FrontStyleType;
  handleStyle: HandleStyleType;
  corpusColor: string;
  corpusTextureId?: string | null;
  frontColor: string;
  frontTextureId?: string | null;
  countertopColor: string;
  countertopTextureId?: string | null;
  backsplashColor: string;
  backsplashTextureId?: string | null;
  plinthColor: string;
  handleColor: string;
}

export interface ParametricFurnitureConfig {
  kind: ParametricFurnitureKind;
  wardrobe?: WardrobeSpec;
  kitchen?: KitchenSpec;
}

export const DEFAULT_WARDROBE_SPEC: WardrobeSpec = {
  widthCm: 180,
  heightCm: 220,
  depthCm: 60,
  doorCount: 3,
  doorType: 'hinged',
  mirrorDoorIndices: [],
  plinthHeightCm: 8,
  hasTopBridge: false,
  topBridgeHeightCm: 45,
  bottomDrawersCount: 0,
  frontStyle: 'flat',
  handleStyle: 'vertical',
  corpusColor: '#d6c7b2',
  corpusTextureId: null,
  frontColor: '#f8fafc',
  frontTextureId: null,
  handleColor: '#1e293b',
  plinthColor: '#cbbba4',
};

export const DEFAULT_KITCHEN_SPEC: KitchenSpec = {
  shape: 'straight',
  widthCm: 240,
  wingWidthCm: 160,
  wingModuleCount: 2,
  depthCm: 60,
  layoutMode: 'base-and-wall',
  baseHeightCm: 86,
  plinthHeightCm: 10,
  countertopThicknessCm: 3.8,
  countertopOverhangCm: 2,
  hasBacksplash: true,
  backsplashHeightCm: 60,
  wallCabinetHeightCm: 72,
  wallCabinetDepthCm: 34,
  tallCabinetHeightCm: 215,
  moduleCount: 4,
  modulePattern: ['doors', 'drawers', 'oven', 'sink'],
  frontStyle: 'flat',
  handleStyle: 'horizontal',
  corpusColor: '#e2e8f0',
  corpusTextureId: null,
  frontColor: '#f1f5f9',
  frontTextureId: null,
  countertopColor: '#334155',
  countertopTextureId: null,
  backsplashColor: '#cbd5e1',
  backsplashTextureId: null,
  plinthColor: '#1e293b',
  handleColor: '#0f172a',
};

export interface SceneObject {
  instanceId: string;
  modelId: string;
  name?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mirrored?: boolean;
  materialOverrides?: Record<string, MaterialOverride>;
  parametric?: ParametricFurnitureConfig;
}

export interface SavedSceneSummary {
  id: string;
  title: string;
  updatedAt?: string;
}

export interface SavedScene {
  id: string;
  title: string;
  objects: SceneObject[];
  room?: RoomConfig;
  updatedAt?: string;
}