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

export interface SceneObject {
  instanceId: string;
  modelId: string;
  name?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mirrored?: boolean;
  materialOverrides?: Record<string, MaterialOverride>;
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