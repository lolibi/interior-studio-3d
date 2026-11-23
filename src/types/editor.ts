import type { RoomConfig } from './room';

export type ModelCategory =
  | 'living_room'
  | 'sofas'
  | 'chairs'
  | 'tables'
  | 'beds'
  | 'storage'
  | 'lighting'
  | 'decor';

export type TextureCategory = 'floor' | 'tiles' | 'wall' | 'furniture';

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

export interface CatalogModel {
  id: string;
  name: string;
  category: ModelCategory;
  dimensionsCm: DimensionsCm;
  scaleMode: ScaleMode;
  scaleConstraints: ScaleConstraints;
  glbUrl?: string | null;
  previewUrl?: string | null;
  glbStorageKey?: string | null;
  previewDataUrl?: string | null;
  isActive: boolean;
}

export interface CreateModelInput {
  name: string;
  category: ModelCategory;
  dimensionsCm: DimensionsCm;
  scaleMode: ScaleMode;
  scaleConstraints: ScaleConstraints;
  glbUrl: string;
  previewUrl: string;
  isActive: boolean;
}

export interface CatalogTexture {
  id: string;
  name: string;
  category: TextureCategory;
  mapUrl: string;
  tileWidthM: number;
  tileHeightM: number;
  roughness: number;
  metalness: number;
  isActive: boolean;
}

export interface CreateTextureInput {
  name: string;
  category: TextureCategory;
  mapUrl: string;
  tileWidthM: number;
  tileHeightM: number;
  roughness: number;
  metalness: number;
  isActive: boolean;
}

export interface MaterialOverride {
  color?: string;
  textureId?: string | null;
}

export interface SceneObject {
  instanceId: string;
  modelId: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mirrored?: boolean;
  materialOverrides?: Record<string, MaterialOverride>; // ключ = името на материала в .glb модела
}

export interface SavedSceneSummary {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface SavedScene {
  id: string;
  title: string;
  objects: SceneObject[];
  room?: RoomConfig;
  created_at?: string;
  updated_at?: string;
  updatedAt?: string;
}

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  living_room: 'Хол и дневна',
  sofas: 'Дивани и кресла',
  chairs: 'Столове',
  tables: 'Маси',
  beds: 'Легла и спалня',
  storage: 'Шкафове и гардероби',
  lighting: 'Осветление',
  decor: 'Декор и аксесоари',
};

export const TEXTURE_CATEGORY_LABELS: Record<TextureCategory, string> = {
  floor: 'Паркет и подови настилки',
  tiles: 'Плочки (баня / кухня / под)',
  wall: 'Стени и мазилки',
  furniture: 'Мебели, дърво и дамаски',
};