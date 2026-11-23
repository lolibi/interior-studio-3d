import type { MaterialOverride } from '../types/editor';

export interface UserFurniturePreset {
  id: string;
  name: string;
  baseModelId: string;
  scale: [number, number, number];
  mirrored: boolean;
  materialOverrides: Record<string, MaterialOverride>;
  createdAt: string;
}

const STORAGE_KEY = 'interior_studio_user_presets_v1';

export function loadUserFurniturePresets(): UserFurniturePreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is UserFurniturePreset =>
        Boolean(
          item &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.baseModelId === 'string'
        )
    );
  } catch {
    return [];
  }
}

export function saveUserFurniturePreset(
  preset: Omit<UserFurniturePreset, 'id' | 'createdAt'>
): UserFurniturePreset[] {
  const existing = loadUserFurniturePresets();
  const created: UserFurniturePreset = {
    ...preset,
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [created, ...existing];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Игнорираме грешка при пълно localStorage
  }
  return updated;
}

export function deleteUserFurniturePreset(presetId: string): UserFurniturePreset[] {
  const existing = loadUserFurniturePresets();
  const updated = existing.filter((p) => p.id !== presetId);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Игнорираме грешка при localStorage
  }
  return updated;
}