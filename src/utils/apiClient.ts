import type {
  CatalogModel,
  CatalogTexture,
  CreateModelInput,
  CreateTextureInput,
  SavedScene,
  SavedSceneSummary,
  SceneObject,
} from '../types/editor';
import type { ApartmentTemplate, RoomConfig } from '../types/room';

const API_BASE_URL = 'https://studio.glb3d.com/api.php';

interface RawApiResponse {
  ok?: boolean;
  error?: string;
  data?: unknown;
  models?: CatalogModel[];
  model?: CatalogModel;
  textures?: CatalogTexture[];
  texture?: CatalogTexture;
  scenes?: SavedSceneSummary[];
  scene?: SavedScene;
  templates?: ApartmentTemplate[];
  template?: ApartmentTemplate;
  url?: string;
  fileName?: string;
  id?: string;
  title?: string;
  deletedId?: string;
}

const DEFAULT_SCALE_CONSTRAINTS = {
  allowX: true,
  allowY: false,
  allowZ: true,
  minCm: { width: 100, height: 50, depth: 50 },
  maxCm: { width: 400, height: 250, depth: 250 },
};

function normalizeModel(raw: CatalogModel): CatalogModel {
  return {
    ...raw,
    isActive: Boolean(raw.isActive),
    scaleConstraints: raw.scaleConstraints ?? DEFAULT_SCALE_CONSTRAINTS,
  };
}

function normalizeTexture(raw: CatalogTexture): CatalogTexture {
  return {
    ...raw,
    tileWidthM: Math.max(0.05, Number(raw.tileWidthM) || 0.6),
    tileHeightM: Math.max(0.05, Number(raw.tileHeightM) || 0.6),
    roughness:
      typeof raw.roughness === 'number'
        ? raw.roughness
        : Number(raw.roughness ?? 0.5),
    metalness:
      typeof raw.metalness === 'number'
        ? raw.metalness
        : Number(raw.metalness ?? 0.05),
    isActive: Boolean(raw.isActive),
  };
}

async function fetchApiRaw(
  url: string,
  init?: RequestInit
): Promise<RawApiResponse> {
  const response = await fetch(url, init);
  let payload: RawApiResponse | null = null;

  try {
    payload = (await response.json()) as RawApiResponse;
  } catch {
    throw new Error(`Сървърът върна невалиден отговор (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(
      payload?.error || `Сървърна грешка (HTTP ${response.status}).`
    );
  }

  return payload;
}

export async function fetchModels(): Promise<CatalogModel[]> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=list_models`, {
    method: 'GET',
    cache: 'no-store',
  });

  const list = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.data)
      ? (payload.data as CatalogModel[])
      : [];

  return list.map(normalizeModel);
}

export async function createModelOnServer(
  input: CreateModelInput,
  adminPassword: string
): Promise<CatalogModel> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=create_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify(input),
  });

  const model =
    payload.model ?? (payload.data as CatalogModel | undefined);
  if (!model) {
    throw new Error('Сървърът не върна създадения модел.');
  }
  return normalizeModel(model);
}

export async function updateModelOnServer(
  id: string,
  patch: Partial<CatalogModel>,
  adminPassword: string
): Promise<CatalogModel> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=update_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id, ...patch }),
  });

  const model =
    payload.model ?? (payload.data as CatalogModel | undefined);
  if (!model) {
    throw new Error('Сървърът не върна обновения модел.');
  }
  return normalizeModel(model);
}

export async function deleteModelOnServer(
  id: string,
  adminPassword: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=delete_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id }),
  });

  return { deletedId: payload.deletedId ?? id };
}

export async function uploadGlbFile(
  file: File,
  adminPassword: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(`${API_BASE_URL}?action=upload_glb`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: formData,
  });

  const dataObj = payload.data as { url?: string; fileName?: string } | undefined;
  const url = payload.url ?? dataObj?.url;
  const fileName = payload.fileName ?? dataObj?.fileName ?? file.name;

  if (!url) {
    throw new Error('Сървърът не върна URL на качения .glb файл.');
  }

  return { url, fileName };
}

export async function uploadPreviewImage(
  file: File,
  adminPassword: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(`${API_BASE_URL}?action=upload_preview`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: formData,
  });

  const dataObj = payload.data as { url?: string; fileName?: string } | undefined;
  const url = payload.url ?? dataObj?.url;
  const fileName = payload.fileName ?? dataObj?.fileName ?? file.name;

  if (!url) {
    throw new Error('Сървърът не върна URL на каченото превю.');
  }

  return { url, fileName };
}

// --- PBR Текстури ---

export async function fetchTextures(): Promise<CatalogTexture[]> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=list_textures`, {
    method: 'GET',
    cache: 'no-store',
  });

  const list = Array.isArray(payload.textures)
    ? payload.textures
    : Array.isArray(payload.data)
      ? (payload.data as CatalogTexture[])
      : [];

  return list.map(normalizeTexture);
}

export async function uploadTextureImage(
  file: File,
  adminPassword: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(`${API_BASE_URL}?action=upload_texture`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: formData,
  });

  const dataObj = payload.data as { url?: string; fileName?: string } | undefined;
  const url = payload.url ?? dataObj?.url;
  const fileName = payload.fileName ?? dataObj?.fileName ?? file.name;

  if (!url) {
    throw new Error('Сървърът не върна URL на качената текстура.');
  }

  return { url, fileName };
}

export async function createTextureOnServer(
  input: CreateTextureInput,
  adminPassword: string
): Promise<CatalogTexture> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=create_texture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify(input),
  });

  const tex =
    payload.texture ?? (payload.data as CatalogTexture | undefined);
  if (!tex) {
    throw new Error('Сървърът не върна създадената текстура.');
  }
  return normalizeTexture(tex);
}

export async function updateTextureOnServer(
  id: string,
  patch: Partial<CatalogTexture>,
  adminPassword: string
): Promise<CatalogTexture> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=update_texture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id, ...patch }),
  });

  const tex =
    payload.texture ?? (payload.data as CatalogTexture | undefined);
  if (!tex) {
    throw new Error('Сървърът не върна обновената текстура.');
  }
  return normalizeTexture(tex);
}

export async function deleteTextureOnServer(
  id: string,
  adminPassword: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=delete_texture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id }),
  });

  return { deletedId: payload.deletedId ?? id };
}

// --- Подложка план ---

export async function uploadFloorplanImage(
  file: File
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(`${API_BASE_URL}?action=upload_floorplan`, {
    method: 'POST',
    body: formData,
  });

  const dataObj = payload.data as { url?: string; fileName?: string } | undefined;
  const url = payload.url ?? dataObj?.url;
  const fileName = payload.fileName ?? dataObj?.fileName ?? file.name;

  if (!url) {
    throw new Error('Сървърът не върна URL на качения план.');
  }

  return { url, fileName };
}

// --- Сцени и шаблони ---

export async function fetchScenes(): Promise<SavedSceneSummary[]> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=list_scenes`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (Array.isArray(payload.scenes)) {
    return payload.scenes;
  }
  if (Array.isArray(payload.data)) {
    return payload.data as SavedSceneSummary[];
  }
  return [];
}

export async function fetchSceneById(id: string): Promise<SavedScene> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=get_scene&id=${encodeURIComponent(id)}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  const scene =
    payload.scene ?? (payload.data as SavedScene | undefined);
  if (!scene) {
    throw new Error('Сървърът не върна данни за избрания проект.');
  }
  return scene;
}

export async function saveSceneToServer(payload: {
  id?: string;
  title: string;
  objects: SceneObject[];
  room?: RoomConfig;
}): Promise<{ id: string; title: string }> {
  const res = await fetchApiRaw(`${API_BASE_URL}?action=save_scene`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const dataObj = res.data as { id?: string; title?: string } | undefined;
  const savedId = res.id ?? res.scene?.id ?? dataObj?.id ?? payload.id ?? '';
  const savedTitle = res.title ?? res.scene?.title ?? dataObj?.title ?? payload.title;

  return { id: savedId, title: savedTitle };
}

export async function fetchApartmentTemplates(): Promise<ApartmentTemplate[]> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=list_templates`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (Array.isArray(payload.templates)) {
    return payload.templates;
  }
  if (Array.isArray(payload.data)) {
    return payload.data as ApartmentTemplate[];
  }
  return [];
}

export async function saveApartmentTemplateToServer(
  template: ApartmentTemplate,
  adminPassword: string
): Promise<ApartmentTemplate> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=save_template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify(template),
  });

  const saved =
    payload.template ?? (payload.data as ApartmentTemplate | undefined);
  if (!saved) {
    throw new Error('Сървърът не върна запазения шаблон.');
  }
  return saved;
}

export async function deleteApartmentTemplateOnServer(
  id: string,
  adminPassword: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=delete_template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id }),
  });

  return { deletedId: payload.deletedId ?? id };
}