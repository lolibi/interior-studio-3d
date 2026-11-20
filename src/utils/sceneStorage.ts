import type { SceneObject } from '../types/editor';

const SCENE_STORAGE_KEY = 'interior_studio_3d_scene_v1';

export function loadSavedScene(): SceneObject[] {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SceneObject[];
  } catch {
    return [];
  }
}

export function saveScene(objects: SceneObject[]): void {
  localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(objects));
}

export function clearSavedScene(): void {
  localStorage.removeItem(SCENE_STORAGE_KEY);
}