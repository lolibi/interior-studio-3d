import type { CatalogModel } from '../types/editor';

const DB_NAME = 'interior_studio_3d_db';
const DB_VERSION = 1;
const STORE_NAME = 'glb_files';
const CATALOG_STORAGE_KEY = 'interior_studio_3d_catalog_v1';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGlbFile(key: string, file: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(file, key);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getGlbFileUrl(key: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);

    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(blob));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteGlbFile(key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const DEFAULT_CATALOG_MODELS: CatalogModel[] = [
  {
    id: 'builtin-sofa-3seater',
    name: 'Триместен диван (Тестов)',
    category: 'sofas',
    dimensionsCm: { width: 220, height: 82, depth: 95 },
    scaleMode: 'fixed',
    scaleConstraints: {
      allowX: false,
      allowY: false,
      allowZ: false,
      minCm: { width: 220, height: 82, depth: 95 },
      maxCm: { width: 220, height: 82, depth: 95 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-armchair-modern',
    name: 'Модерен фотьойл',
    category: 'armchairs',
    dimensionsCm: { width: 85, height: 80, depth: 85 },
    scaleMode: 'fixed',
    scaleConstraints: {
      allowX: false,
      allowY: false,
      allowZ: false,
      minCm: { width: 85, height: 80, depth: 85 },
      maxCm: { width: 85, height: 80, depth: 85 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-dining-chair',
    name: 'Трапезен стол',
    category: 'chairs',
    dimensionsCm: { width: 48, height: 84, depth: 52 },
    scaleMode: 'fixed',
    scaleConstraints: {
      allowX: false,
      allowY: false,
      allowZ: false,
      minCm: { width: 48, height: 84, depth: 52 },
      maxCm: { width: 48, height: 84, depth: 52 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-dining-table',
    name: 'Трапезна маса (разтегателна)',
    category: 'tables',
    dimensionsCm: { width: 160, height: 75, depth: 90 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: false,
      allowZ: true,
      minCm: { width: 120, height: 75, depth: 80 },
      maxCm: { width: 240, height: 75, depth: 110 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-coffee-table',
    name: 'Холна масичка',
    category: 'tables',
    dimensionsCm: { width: 110, height: 42, depth: 60 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: false,
      allowZ: true,
      minCm: { width: 70, height: 42, depth: 50 },
      maxCm: { width: 150, height: 42, depth: 90 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-double-bed',
    name: 'Двойно легло 160x200',
    category: 'beds',
    dimensionsCm: { width: 176, height: 105, depth: 214 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: false,
      allowZ: false,
      minCm: { width: 156, height: 105, depth: 214 },
      maxCm: { width: 216, height: 105, depth: 214 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-wardrobe-2door',
    name: 'Гардероб модулен',
    category: 'wardrobes',
    dimensionsCm: { width: 150, height: 220, depth: 60 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: true,
      allowZ: false,
      minCm: { width: 80, height: 190, depth: 60 },
      maxCm: { width: 300, height: 260, depth: 60 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-kitchen-base',
    name: 'Кухненски долен шкаф с плот',
    category: 'kitchen',
    dimensionsCm: { width: 180, height: 90, depth: 60 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: false,
      allowZ: false,
      minCm: { width: 60, height: 90, depth: 60 },
      maxCm: { width: 360, height: 90, depth: 60 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-floor-lamp',
    name: 'Стояща лампа (Лампион)',
    category: 'lighting',
    dimensionsCm: { width: 42, height: 165, depth: 42 },
    scaleMode: 'fixed',
    scaleConstraints: {
      allowX: false,
      allowY: false,
      allowZ: false,
      minCm: { width: 42, height: 165, depth: 42 },
      maxCm: { width: 42, height: 165, depth: 42 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-toilet-wc',
    name: 'Тоалетна чиния (моноблок)',
    category: 'bathroom',
    dimensionsCm: { width: 38, height: 78, depth: 65 },
    scaleMode: 'fixed',
    scaleConstraints: {
      allowX: false,
      allowY: false,
      allowZ: false,
      minCm: { width: 38, height: 78, depth: 65 },
      maxCm: { width: 38, height: 78, depth: 65 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-bathroom-vanity',
    name: 'Шкаф за баня с мивка',
    category: 'bathroom',
    dimensionsCm: { width: 80, height: 85, depth: 46 },
    scaleMode: 'constrained',
    scaleConstraints: {
      allowX: true,
      allowY: false,
      allowZ: false,
      minCm: { width: 55, height: 85, depth: 46 },
      maxCm: { width: 140, height: 85, depth: 46 },
    },
    isActive: true,
    isBuiltIn: true,
  },
  {
    id: 'builtin-decor-panel',
    name: 'Декоративен стенен панел (Свободен)',
    category: 'wardrobes',
    dimensionsCm: { width: 100, height: 240, depth: 5 },
    scaleMode: 'free',
    scaleConstraints: {
      allowX: true,
      allowY: true,
      allowZ: true,
      minCm: { width: 20, height: 20, depth: 2 },
      maxCm: { width: 400, height: 265, depth: 50 },
    },
    isActive: true,
    isBuiltIn: true,
  },
];

export function loadCatalog(): CatalogModel[] {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(DEFAULT_CATALOG_MODELS));
      return DEFAULT_CATALOG_MODELS;
    }
    return JSON.parse(raw) as CatalogModel[];
  } catch {
    return DEFAULT_CATALOG_MODELS;
  }
}

export function saveCatalog(models: CatalogModel[]): void {
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(models));
}

export function resetCatalogToDefaults(): CatalogModel[] {
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(DEFAULT_CATALOG_MODELS));
  return DEFAULT_CATALOG_MODELS;
}