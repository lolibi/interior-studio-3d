import type {
  CatalogCategoryItem,
  CatalogModel,
  CatalogTexture,
  CreateModelInput,
  CreateTextureInput,
  SavedScene,
} from '../types/editor';
import type { RoomConfig } from '../types/room';
import type {
  AdminDashboardStats,
  AdminTeam,
  AuthUser,
  PlanConfigMap,
  SystemSettings,
  UserRole,
  UserStatus,
} from '../types/auth';

const envApiUrl =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_URL as string | undefined)
    : undefined;

const API_BASE_URL =
  envApiUrl && envApiUrl.trim() !== ''
    ? envApiUrl.trim().replace(/\/+$/, '')
    : 'https://studio.glb3d.com/api.php';

const AUTH_TOKEN_KEY = 'studio3d_auth_token_v1';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token && token.trim() !== '') {
      localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function buildUrl(action: string, params?: Record<string, string>): string {
  const sep = API_BASE_URL.includes('?') ? '&' : '?';
  const query = new URLSearchParams({ action, ...(params ?? {}) }).toString();
  return `${API_BASE_URL}${sep}${query}`;
}

function buildHeaders(adminPassword?: string, json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (adminPassword && adminPassword.trim() !== '') {
    headers['X-Admin-Password'] = adminPassword.trim();
  }
  return headers;
}

async function parseJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`${fallbackError} (HTTP ${res.status})`);
    }
    throw new Error('Невалиден JSON отговор от сървъра.');
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `${fallbackError} (HTTP ${res.status})`);
  }

  return data as T;
}

export interface AuthSessionResponse {
  ok: boolean;
  token?: string | null;
  authenticated?: boolean;
  requiresApproval?: boolean;
  user: AuthUser | null;
  settings: SystemSettings;
}

export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(buildUrl('register'), {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<AuthSessionResponse>(res, 'Грешка при регистрация.');
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(buildUrl('login'), {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<AuthSessionResponse>(res, 'Грешка при вход.');
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function fetchMe(): Promise<AuthSessionResponse> {
  const res = await fetch(buildUrl('me'), {
    method: 'GET',
    headers: buildHeaders(undefined, false),
  });
  return parseJsonResponse<AuthSessionResponse>(res, 'Грешка при проверка на сесията.');
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch(buildUrl('logout'), {
      method: 'POST',
      headers: buildHeaders(undefined, true),
    });
  } catch {
    // ignore
  } finally {
    setAuthToken(null);
  }
}

export async function verifyAdminCredentials(adminPassword?: string): Promise<boolean> {
  const res = await fetch(buildUrl('verify_admin'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({}),
  });
  const data = await parseJsonResponse<{ ok: boolean; authenticated?: boolean }>(
    res,
    'Неуспешна администраторска проверка.'
  );
  return Boolean(data.ok && (data.authenticated ?? true));
}

// ============================================================================
// ДИНАМИЧНИ КАТЕГОРИИ
// ============================================================================

export async function fetchCategories(
  scope?: 'model' | 'texture'
): Promise<CatalogCategoryItem[]> {
  const res = await fetch(
    buildUrl('list_categories', scope ? { scope } : undefined),
    {
      method: 'GET',
      headers: buildHeaders(undefined, false),
    }
  );
  const data = await parseJsonResponse<{ ok: boolean; categories?: CatalogCategoryItem[] }>(
    res,
    'Неуспешно зареждане на категориите.'
  );
  return Array.isArray(data.categories) ? data.categories : [];
}

export async function saveCategory(
  payload: {
    id?: string;
    slug?: string;
    name: string;
    scope: 'model' | 'texture';
    sortOrder?: number;
    snapToWall?: boolean;
  },
  adminPassword?: string
): Promise<CatalogCategoryItem> {
  const res = await fetch(buildUrl('save_category'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; category: CatalogCategoryItem }>(
    res,
    'Неуспешно запазване на категорията.'
  );
  return data.category;
}

export async function deleteCategory(id: string, adminPassword?: string): Promise<void> {
  const res = await fetch(buildUrl('delete_category'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id }),
  });
  await parseJsonResponse(res, 'Неуспешно изтриване на категорията.');
}

// ============================================================================
// АДМИН: СТАТИСТИКА, ПОТРЕБИТЕЛИ, ЕКИПИ, НАСТРОЙКИ
// ============================================================================

export async function fetchAdminDashboard(adminPassword?: string): Promise<AdminDashboardStats> {
  const res = await fetch(buildUrl('admin_dashboard_stats'), {
    method: 'GET',
    headers: buildHeaders(adminPassword, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; stats: AdminDashboardStats }>(
    res,
    'Неуспешно зареждане на статистиката.'
  );
  return data.stats;
}

export async function fetchAdminUsers(adminPassword?: string): Promise<AuthUser[]> {
  const res = await fetch(buildUrl('admin_list_users'), {
    method: 'GET',
    headers: buildHeaders(adminPassword, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; users?: AuthUser[] }>(
    res,
    'Неуспешно зареждане на потребителите.'
  );
  return Array.isArray(data.users) ? data.users : [];
}

export async function adminCreateUser(
  payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    planLevel: AuthUser['planLevel'];
    aiCreditsBalance?: number;
  },
  adminPassword?: string
): Promise<AuthUser> {
  const res = await fetch(buildUrl('admin_create_user'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; user: AuthUser }>(
    res,
    'Неуспешно създаване на потребител.'
  );
  return data.user;
}

export async function adminUpdateUser(
  payload: {
    id: string;
    name?: string;
    status?: UserStatus;
    role?: UserRole;
    planLevel?: AuthUser['planLevel'];
    newPassword?: string;
  },
  adminPassword?: string
): Promise<AuthUser> {
  const res = await fetch(buildUrl('admin_update_user'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; user: AuthUser }>(
    res,
    'Неуспешно обновяване на потребител.'
  );
  return data.user;
}

export async function adminAddUserCredits(
  payload: {
    userId: string;
    delta: number;
    reason?: string;
  },
  adminPassword?: string
): Promise<AuthUser> {
  const res = await fetch(buildUrl('admin_add_credits'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; user: AuthUser }>(
    res,
    'Неуспешно обновяване на кредитите.'
  );
  return data.user;
}

export async function adminDeleteUser(userId: string, adminPassword?: string): Promise<void> {
  const res = await fetch(buildUrl('admin_delete_user'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id: userId }),
  });
  await parseJsonResponse(res, 'Неуспешно изтриване на потребител.');
}

export async function fetchTeams(adminPassword?: string): Promise<AdminTeam[]> {
  const res = await fetch(buildUrl('admin_list_teams'), {
    method: 'GET',
    headers: buildHeaders(adminPassword, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; teams?: AdminTeam[] }>(
    res,
    'Неуспешно зареждане на екипите.'
  );
  return Array.isArray(data.teams) ? data.teams : [];
}

export async function createTeam(
  payload: {
    name: string;
    ownerUserId?: string;
    sharedAiCredits?: number;
    maxMembers?: number;
  },
  adminPassword?: string
): Promise<string> {
  const res = await fetch(buildUrl('admin_create_team'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; teamId: string }>(
    res,
    'Неуспешно създаване на екип.'
  );
  return data.teamId;
}

export async function addTeamCredits(
  payload: {
    teamId: string;
    delta: number;
    reason?: string;
  },
  adminPassword?: string
): Promise<number> {
  const res = await fetch(buildUrl('admin_add_team_credits'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; sharedAiCredits: number }>(
    res,
    'Неуспешно зареждане на екипни кредити.'
  );
  return data.sharedAiCredits;
}

export async function manageTeamMember(
  payload: {
    teamId: string;
    email?: string;
    userId?: string;
    subAction: 'upsert' | 'remove';
    creditLimit?: number;
  },
  adminPassword?: string
): Promise<void> {
  const res = await fetch(buildUrl('team_manage_member'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  await parseJsonResponse(res, 'Неуспешно обновяване на член от екипа.');
}

export async function updateSystemSettings(
  payload: {
    requireAdminApproval?: boolean;
    planConfigs?: Partial<PlanConfigMap>;
  },
  adminPassword?: string
): Promise<SystemSettings> {
  const res = await fetch(buildUrl('admin_update_system_settings'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; settings: SystemSettings }>(
    res,
    'Неуспешно запазване на системните настройки.'
  );
  return data.settings;
}

// ============================================================================
// КАЧВАНЕ НА ФАЙЛОВЕ
// ============================================================================

export async function uploadGlbFile(file: File, adminPassword?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(buildUrl('upload_glb'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, false),
    body: formData,
  });
  const data = await parseJsonResponse<{ ok: boolean; url?: string }>(
    res,
    'Неуспешно качване на .glb файл.'
  );
  if (!data.url) throw new Error('Сървърът не върна URL за .glb файла.');
  return data.url;
}

export async function uploadPreviewFile(file: File, adminPassword?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(buildUrl('upload_preview'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, false),
    body: formData,
  });
  const data = await parseJsonResponse<{ ok: boolean; url?: string }>(
    res,
    'Неуспешно качване на превю изображение.'
  );
  if (!data.url) throw new Error('Сървърът не върна URL за превюто.');
  return data.url;
}

export async function uploadTextureFile(file: File, adminPassword?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(buildUrl('upload_texture'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, false),
    body: formData,
  });
  const data = await parseJsonResponse<{ ok: boolean; url?: string }>(
    res,
    'Неуспешно качване на текстура.'
  );
  if (!data.url) throw new Error('Сървърът не върна URL за текстурата.');
  return data.url;
}

export async function uploadFloorplanFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(buildUrl('upload_floorplan'), {
    method: 'POST',
    headers: buildHeaders(undefined, false),
    body: formData,
  });
  const data = await parseJsonResponse<{ ok: boolean; url?: string }>(
    res,
    'Неуспешно качване на снимката на плана.'
  );
  if (!data.url) throw new Error('Сървърът не върна URL за снимката на плана.');
  return data.url;
}

// ============================================================================
// PBR ТЕКСТУРИ
// ============================================================================

export async function fetchTextures(): Promise<CatalogTexture[]> {
  const res = await fetch(buildUrl('list_textures'), {
    method: 'GET',
    headers: buildHeaders(undefined, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; textures?: CatalogTexture[] }>(
    res,
    'Неуспешно зареждане на текстурите.'
  );
  return Array.isArray(data.textures) ? data.textures : [];
}

export async function createTexture(
  input: CreateTextureInput,
  adminPassword?: string
): Promise<CatalogTexture> {
  const res = await fetch(buildUrl('create_texture'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(input),
  });
  const data = await parseJsonResponse<{ ok: boolean; texture: CatalogTexture }>(
    res,
    'Неуспешно създаване на текстура.'
  );
  return data.texture;
}

export async function updateTexture(
  id: string,
  input: Partial<CreateTextureInput>,
  adminPassword?: string
): Promise<CatalogTexture> {
  const res = await fetch(buildUrl('update_texture'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id, ...input }),
  });
  const data = await parseJsonResponse<{ ok: boolean; texture: CatalogTexture }>(
    res,
    'Неуспешно обновяване на текстура.'
  );
  return data.texture;
}

export async function deleteTexture(id: string, adminPassword?: string): Promise<void> {
  const res = await fetch(buildUrl('delete_texture'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id }),
  });
  await parseJsonResponse(res, 'Неуспешно изтриване на текстура.');
}

// ============================================================================
// 3D МОДЕЛИ
// ============================================================================

export async function fetchModels(): Promise<CatalogModel[]> {
  const res = await fetch(buildUrl('list_models'), {
    method: 'GET',
    headers: buildHeaders(undefined, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; models?: CatalogModel[] }>(
    res,
    'Неуспешно зареждане на 3D моделите.'
  );
  return Array.isArray(data.models) ? data.models : [];
}

export async function createModel(
  input: CreateModelInput,
  adminPassword?: string
): Promise<CatalogModel> {
  const res = await fetch(buildUrl('create_model'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify(input),
  });
  const data = await parseJsonResponse<{ ok: boolean; model: CatalogModel }>(
    res,
    'Неуспешно създаване на 3D модел.'
  );
  return data.model;
}

export async function updateModel(
  id: string,
  input: Partial<CreateModelInput>,
  adminPassword?: string
): Promise<CatalogModel> {
  const res = await fetch(buildUrl('update_model'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id, ...input }),
  });
  const data = await parseJsonResponse<{ ok: boolean; model: CatalogModel }>(
    res,
    'Неуспешно обновяване на 3D модел.'
  );
  return data.model;
}

export async function deleteModel(id: string, adminPassword?: string): Promise<void> {
  const res = await fetch(buildUrl('delete_model'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id }),
  });
  await parseJsonResponse(res, 'Неуспешно изтриване на 3D модел.');
}

// ============================================================================
// СЦЕНИ / ПРОЕКТИ
// ============================================================================

export interface CloudSceneListItem {
  id: string;
  title: string;
  userId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  updatedAt?: string;
}

export async function listScenes(): Promise<CloudSceneListItem[]> {
  const res = await fetch(buildUrl('list_scenes'), {
    method: 'GET',
    headers: buildHeaders(undefined, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; scenes?: CloudSceneListItem[] }>(
    res,
    'Неуспешно зареждане на списъка с проекти.'
  );
  return Array.isArray(data.scenes) ? data.scenes : [];
}

export async function loadScene(id: string): Promise<SavedScene> {
  const res = await fetch(buildUrl('get_scene', { id }), {
    method: 'GET',
    headers: buildHeaders(undefined, false),
  });
  const data = await parseJsonResponse<{ ok: boolean; scene?: SavedScene }>(
    res,
    'Неуспешно зареждане на проект.'
  );
  if (!data.scene) throw new Error('Проектът липсва в отговора.');
  return data.scene;
}

export async function saveScene(payload: {
  id?: string;
  title: string;
  objects: SavedScene['objects'];
  room?: RoomConfig;
}): Promise<{ id: string; title: string }> {
  const res = await fetch(buildUrl('save_scene'), {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ ok: boolean; id: string; title: string }>(
    res,
    'Неуспешно запазване на проекта.'
  );
  return { id: data.id, title: data.title };
}

export async function adminDeleteScene(id: string, adminPassword?: string): Promise<void> {
  const res = await fetch(buildUrl('admin_delete_scene'), {
    method: 'POST',
    headers: buildHeaders(adminPassword, true),
    body: JSON.stringify({ id }),
  });
  await parseJsonResponse(res, 'Неуспешно изтриване на проект.');
}