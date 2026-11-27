import type {
  AdminDashboardStats,
  AuditLogEntry,
  AuthUser,
  PlanLevel,
  SystemSettings,
  TeamDetails,
  UserRole,
  UserStatus,
} from '../types/auth';
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
const AUTH_TOKEN_STORAGE_KEY = 'interior_studio_auth_token_v1';

export function getStoredAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

interface RawApiResponse {
  ok?: boolean;
  error?: string;
  data?: unknown;
  token?: string | null;
  authenticated?: boolean;
  requiresApproval?: boolean;
  user?: AuthUser | null;
  users?: AuthUser[];
  teams?: TeamDetails[];
  teamId?: string;
  sharedAiCredits?: number;
  settings?: SystemSettings;
  stats?: AdminDashboardStats;
  recentLogs?: AuditLogEntry[];
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
    isPremium: Boolean(raw.isPremium),
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
    isPremium: Boolean(raw.isPremium),
  };
}

function buildAuthHeaders(
  extraHeaders?: Record<string, string>,
  adminPassword?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (adminPassword) {
    headers['X-Admin-Password'] = adminPassword;
  }
  return headers;
}

async function fetchApiRaw(
  url: string,
  init?: RequestInit,
  adminPassword?: string
): Promise<RawApiResponse> {
  const existingHeaders =
    init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers)
      ? (init.headers as Record<string, string>)
      : {};

  const response = await fetch(url, {
    ...init,
    headers: buildAuthHeaders(existingHeaders, adminPassword),
  });

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

// ============================================================================
// AUTH & SESSION API
// ============================================================================

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  token: string | null;
  requiresApproval: boolean;
  user: AuthUser;
  settings: SystemSettings;
}> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (payload.token) {
    setStoredAuthToken(payload.token);
  }

  return {
    token: payload.token ?? null,
    requiresApproval: Boolean(payload.requiresApproval),
    user: payload.user as AuthUser,
    settings: payload.settings as SystemSettings,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{
  token: string | null;
  requiresApproval: boolean;
  user: AuthUser;
  settings: SystemSettings;
}> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (payload.token) {
    setStoredAuthToken(payload.token);
  }

  return {
    token: payload.token ?? null,
    requiresApproval: Boolean(payload.requiresApproval),
    user: payload.user as AuthUser,
    settings: payload.settings as SystemSettings,
  };
}

export async function fetchCurrentUser(): Promise<{
  authenticated: boolean;
  requiresApproval: boolean;
  user: AuthUser | null;
  settings: SystemSettings;
}> {
  const payload = await fetchApiRaw(`${API_BASE_URL}?action=me`, {
    method: 'GET',
    cache: 'no-store',
  });

  return {
    authenticated: Boolean(payload.authenticated),
    requiresApproval: Boolean(payload.requiresApproval),
    user: payload.user ?? null,
    settings: payload.settings as SystemSettings,
  };
}

export async function logoutUser(): Promise<void> {
  try {
    await fetchApiRaw(`${API_BASE_URL}?action=logout`, { method: 'POST' });
  } finally {
    setStoredAuthToken(null);
  }
}

// ============================================================================
// ADMIN USERS, TEAMS, STATS & SETTINGS
// ============================================================================

export async function fetchAdminDashboardStats(adminPassword?: string): Promise<{
  stats: AdminDashboardStats;
  recentLogs: AuditLogEntry[];
}> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_dashboard_stats`,
    { method: 'GET', cache: 'no-store' },
    adminPassword
  );
  return {
    stats: payload.stats as AdminDashboardStats,
    recentLogs: Array.isArray(payload.recentLogs) ? payload.recentLogs : [],
  };
}

export async function fetchAdminUsers(adminPassword?: string): Promise<AuthUser[]> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_list_users`,
    { method: 'GET', cache: 'no-store' },
    adminPassword
  );
  return Array.isArray(payload.users) ? payload.users : [];
}

export async function createAdminUser(
  input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    planLevel: PlanLevel;
    aiCreditsBalance: number;
  },
  adminPassword?: string
): Promise<AuthUser> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_create_user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
  return payload.user as AuthUser;
}

export async function updateAdminUser(
  input: {
    id: string;
    name?: string;
    status?: UserStatus;
    role?: UserRole;
    planLevel?: PlanLevel;
    newPassword?: string;
  },
  adminPassword?: string
): Promise<AuthUser> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_update_user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
  return payload.user as AuthUser;
}

export async function addAdminUserCredits(
  input: { userId: string; delta: number; reason?: string },
  adminPassword?: string
): Promise<AuthUser> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_add_credits`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
  return payload.user as AuthUser;
}

export async function deleteAdminUser(
  id: string,
  adminPassword?: string
): Promise<void> {
  await fetchApiRaw(
    `${API_BASE_URL}?action=admin_delete_user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    adminPassword
  );
}

export async function fetchTeams(adminPassword?: string): Promise<TeamDetails[]> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_list_teams`,
    { method: 'GET', cache: 'no-store' },
    adminPassword
  );
  return Array.isArray(payload.teams) ? payload.teams : [];
}

export async function createTeam(
  input: {
    name: string;
    ownerUserId?: string;
    sharedAiCredits?: number;
    maxMembers?: number;
  },
  adminPassword?: string
): Promise<{ teamId: string }> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_create_team`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
  return { teamId: payload.teamId || '' };
}

export async function addTeamCredits(
  input: { teamId: string; delta: number; reason?: string },
  adminPassword?: string
): Promise<{ sharedAiCredits: number }> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_add_team_credits`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
  return { sharedAiCredits: Number(payload.sharedAiCredits ?? 0) };
}

export async function manageTeamMember(
  input: {
    teamId: string;
    email?: string;
    userId?: string;
    subAction: 'upsert' | 'remove';
    creditLimit?: number;
  },
  adminPassword?: string
): Promise<void> {
  await fetchApiRaw(
    `${API_BASE_URL}?action=team_manage_member`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );
}

export async function updateSystemSettings(
  patch: Partial<SystemSettings>,
  adminPassword?: string
): Promise<SystemSettings> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=admin_update_system_settings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    adminPassword
  );
  return payload.settings as SystemSettings;
}

export async function deleteAdminScene(
  id: string,
  adminPassword?: string
): Promise<void> {
  await fetchApiRaw(
    `${API_BASE_URL}?action=admin_delete_scene`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    adminPassword
  );
}

// ============================================================================
// 3D МОДЕЛИ
// ============================================================================

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
  adminPassword?: string
): Promise<CatalogModel> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=create_model`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );

  const model = payload.model ?? (payload.data as CatalogModel | undefined);
  if (!model) {
    throw new Error('Сървърът не върна създадения модел.');
  }
  return normalizeModel(model);
}

export async function updateModelOnServer(
  id: string,
  patch: Partial<CatalogModel>,
  adminPassword?: string
): Promise<CatalogModel> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=update_model`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    },
    adminPassword
  );

  const model = payload.model ?? (payload.data as CatalogModel | undefined);
  if (!model) {
    throw new Error('Сървърът не върна обновения модел.');
  }
  return normalizeModel(model);
}

export async function deleteModelOnServer(
  id: string,
  adminPassword?: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=delete_model`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    adminPassword
  );

  return { deletedId: payload.deletedId ?? id };
}

export async function uploadGlbFile(
  file: File,
  adminPassword?: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=upload_glb`,
    {
      method: 'POST',
      body: formData,
    },
    adminPassword
  );

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
  adminPassword?: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=upload_preview`,
    {
      method: 'POST',
      body: formData,
    },
    adminPassword
  );

  const dataObj = payload.data as { url?: string; fileName?: string } | undefined;
  const url = payload.url ?? dataObj?.url;
  const fileName = payload.fileName ?? dataObj?.fileName ?? file.name;

  if (!url) {
    throw new Error('Сървърът не върна URL на каченото превю.');
  }

  return { url, fileName };
}

// ============================================================================
// PBR ТЕКСТУРИ
// ============================================================================

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
  adminPassword?: string
): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=upload_texture`,
    {
      method: 'POST',
      body: formData,
    },
    adminPassword
  );

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
  adminPassword?: string
): Promise<CatalogTexture> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=create_texture`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    adminPassword
  );

  const tex = payload.texture ?? (payload.data as CatalogTexture | undefined);
  if (!tex) {
    throw new Error('Сървърът не върна създадената текстура.');
  }
  return normalizeTexture(tex);
}

export async function updateTextureOnServer(
  id: string,
  patch: Partial<CatalogTexture>,
  adminPassword?: string
): Promise<CatalogTexture> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=update_texture`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    },
    adminPassword
  );

  const tex = payload.texture ?? (payload.data as CatalogTexture | undefined);
  if (!tex) {
    throw new Error('Сървърът не върна обновената текстура.');
  }
  return normalizeTexture(tex);
}

export async function deleteTextureOnServer(
  id: string,
  adminPassword?: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=delete_texture`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    adminPassword
  );

  return { deletedId: payload.deletedId ?? id };
}

// ============================================================================
// ПОДЛОЖКА ПЛАН, СЦЕНИ И ШАБЛОНИ
// ============================================================================

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

  const scene = payload.scene ?? (payload.data as SavedScene | undefined);
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
    headers: { 'Content-Type': 'application/json' },
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
  adminPassword?: string
): Promise<ApartmentTemplate> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=save_template`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    },
    adminPassword
  );

  const saved = payload.template ?? (payload.data as ApartmentTemplate | undefined);
  if (!saved) {
    throw new Error('Сървърът не върна запазения шаблон.');
  }
  return saved;
}

export async function deleteApartmentTemplateOnServer(
  id: string,
  adminPassword?: string
): Promise<{ deletedId: string }> {
  const payload = await fetchApiRaw(
    `${API_BASE_URL}?action=delete_template`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    adminPassword
  );

  return { deletedId: payload.deletedId ?? id };
}