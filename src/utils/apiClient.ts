import type {
  CatalogModel,
  CreateModelInput,
  SavedScene,
  SavedSceneSummary,
  SceneObject,
} from '../types/editor';
import type { ApartmentTemplate, RoomConfig } from '../types/room';

const API_BASE_URL = 'https://studio.glb3d.com/api.php';
const TEMPLATES_LOCAL_KEY = 'interior_studio_3d_apartment_templates_v1';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function parseApiJson<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`Сървърът върна невалиден отговор (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error || `Сървърна грешка (HTTP ${response.status}).`);
  }

  return payload.data;
}

function readLocalTemplates(): ApartmentTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ApartmentTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTemplates(templates: ApartmentTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_LOCAL_KEY, JSON.stringify(templates));
  } catch {
    // Игнориране при пълен localStorage
  }
}

export async function fetchModels(): Promise<CatalogModel[]> {
  const response = await fetch(`${API_BASE_URL}?action=list_models`, {
    method: 'GET',
    cache: 'no-store',
  });
  return parseApiJson<CatalogModel[]>(response);
}

export async function createModelOnServer(
  input: CreateModelInput,
  adminPassword: string
): Promise<CatalogModel> {
  const response = await fetch(`${API_BASE_URL}?action=create_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify(input),
  });
  return parseApiJson<CatalogModel>(response);
}

export async function updateModelOnServer(
  id: string,
  patch: Partial<CatalogModel>,
  adminPassword: string
): Promise<CatalogModel> {
  const response = await fetch(`${API_BASE_URL}?action=update_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id, ...patch }),
  });
  return parseApiJson<CatalogModel>(response);
}

export async function deleteModelOnServer(
  id: string,
  adminPassword: string
): Promise<{ deletedId: string }> {
  const response = await fetch(`${API_BASE_URL}?action=delete_model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ id }),
  });
  return parseApiJson<{ deletedId: string }>(response);
}

export async function uploadGlbFile(
  file: File,
  adminPassword: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}?action=upload_glb`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: formData,
  });
  return parseApiJson<{ url: string; fileName: string }>(response);
}

export async function uploadPreviewImage(
  file: File,
  adminPassword: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}?action=upload_preview`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: formData,
  });
  return parseApiJson<{ url: string; fileName: string }>(response);
}

export async function fetchScenes(): Promise<SavedSceneSummary[]> {
  const response = await fetch(`${API_BASE_URL}?action=list_scenes`, {
    method: 'GET',
    cache: 'no-store',
  });
  return parseApiJson<SavedSceneSummary[]>(response);
}

export async function fetchSceneById(id: string): Promise<SavedScene> {
  const response = await fetch(
    `${API_BASE_URL}?action=get_scene&id=${encodeURIComponent(id)}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
  return parseApiJson<SavedScene>(response);
}

export async function saveSceneToServer(payload: {
  id?: string;
  title: string;
  objects: SceneObject[];
  room?: RoomConfig;
}): Promise<{ id: string; title: string }> {
  const response = await fetch(`${API_BASE_URL}?action=save_scene`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseApiJson<{ id: string; title: string }>(response);
}

export async function fetchApartmentTemplates(): Promise<ApartmentTemplate[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=list_templates`, {
      method: 'GET',
      cache: 'no-store',
    });
    const list = await parseApiJson<ApartmentTemplate[]>(response);
    writeLocalTemplates(list);
    return list;
  } catch {
    return readLocalTemplates();
  }
}

export async function saveApartmentTemplateToServer(
  template: ApartmentTemplate,
  adminPassword: string
): Promise<ApartmentTemplate> {
  const currentLocal = readLocalTemplates();
  const idx = currentLocal.findIndex((t) => t.id === template.id);
  const nextLocal =
    idx >= 0
      ? currentLocal.map((t, i) => (i === idx ? template : t))
      : [template, ...currentLocal];
  writeLocalTemplates(nextLocal);

  try {
    const response = await fetch(`${API_BASE_URL}?action=save_template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': adminPassword,
      },
      body: JSON.stringify(template),
    });
    return await parseApiJson<ApartmentTemplate>(response);
  } catch {
    return template;
  }
}

export async function deleteApartmentTemplateOnServer(
  id: string,
  adminPassword: string
): Promise<{ deletedId: string }> {
  const remaining = readLocalTemplates().filter((t) => t.id !== id);
  writeLocalTemplates(remaining);

  try {
    const response = await fetch(`${API_BASE_URL}?action=delete_template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': adminPassword,
      },
      body: JSON.stringify({ id }),
    });
    return await parseApiJson<{ deletedId: string }>(response);
  } catch {
    return { deletedId: id };
  }
}