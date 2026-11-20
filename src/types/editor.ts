export type ModelCategory =
  | 'sofas'
  | 'armchairs'
  | 'chairs'
  | 'tables'
  | 'beds'
  | 'wardrobes'
  | 'kitchen'
  | 'lighting'
  | 'bathroom';

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  sofas: 'Дивани',
  armchairs: 'Фотьойли',
  chairs: 'Столове',
  tables: 'Маси',
  beds: 'Легла',
  wardrobes: 'Гардероби',
  kitchen: 'Кухненски шкафове',
  lighting: 'Осветление',
  bathroom: 'Баня',
};

export type ScaleMode = 'fixed' | 'constrained' | 'free';

export interface DimensionsCm {
  width: number;  // ос X в сантиметри
  height: number; // ос Y в сантиметри
  depth: number;  // ос Z в сантиметри
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
  glbStorageKey?: string;
  previewDataUrl?: string;
  isActive: boolean;
  isBuiltIn?: boolean;
}

export interface SceneObject {
  instanceId: string;
  modelId: string;
  name: string;
  /** Позиция в метри [X, Y, Z] */
  position: [number, number, number];
  /** Ротация в радиани [X, Y, Z] */
  rotation: [number, number, number];
  /** Мащаб като множител [1, 1, 1] = 100% от базовия размер */
  scale: [number, number, number];
}

export type DisplayUnit = 'cm' | 'm';

export type TransformTool = 'translate' | 'rotate' | 'scale';