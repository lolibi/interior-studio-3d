import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CATEGORY_LABELS,
  DEFAULT_TEXTURE_CATEGORY_LABELS,
} from '../types/editor';
import type {
  CatalogCategoryItem,
  CatalogModel,
  CatalogTexture,
  CreateModelInput,
  CreateTextureInput,
  ScaleMode,
} from '../types/editor';
import type {
  AdminDashboardStats,
  AdminTeam,
  AuthUser,
  PlanConfigMap,
  PlanLevel,
  SystemSettings,
  TeamMember,
  UserRole,
  UserStatus,
} from '../types/auth';
import {
  adminAddUserCredits,
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  addTeamCredits,
  createModel,
  createTeam,
  createTexture,
  deleteCategory,
  deleteModel,
  deleteTexture,
  fetchAdminDashboard,
  fetchAdminUsers,
  fetchCategories,
  fetchModels,
  fetchTeams,
  fetchTextures,
  manageTeamMember,
  saveCategory,
  updateModel,
  updateSystemSettings,
  updateTexture,
  uploadGlbFile,
  uploadPreviewFile,
  uploadTextureFile,
} from '../utils/apiClient';
import {
  canAccessAdminPanel,
  canManagePlansAndSettings,
  canManageUsersAndTeams,
  getPlanLabel,
  getRoleLabel,
} from '../utils/permissions';

type AdminSection =
  | 'dashboard'
  | 'models'
  | 'textures'
  | 'users'
  | 'teams'
  | 'settings';

export interface AdminPageProps {
  currentUser: AuthUser | null;
  systemSettings: SystemSettings | null;
  onSystemSettingsUpdated: (next: SystemSettings) => void;
  onRefreshCurrentUser: () => Promise<void>;
  onCatalogUpdated: () => Promise<void>;
  onExitToStudio: () => void;
}

const COLOR_PRESETS = [
  'Бял',
  'Черен',
  'Сив',
  'Антрацит',
  'Бежов',
  'Крем / Слонова кост',
  'Кафяв',
  'Дъб',
  'Орех',
  'Зелен',
  'Син',
  'Златист / Месинг',
];

const MATERIAL_PRESETS = [
  'Дамаска / Текстил',
  'Букле',
  'Кадифе',
  'Естествена кожа',
  'Еко кожа',
  'Масив / Дърво',
  'ПДЧ / МДФ',
  'Метал / Стомана',
  'Стъкло',
  'Камък / Мрамор',
  'Керамика / Порцелан',
];

const STYLE_PRESETS = [
  'Модерен',
  'Минимализъм',
  'Скандинавски',
  'Индустриален',
  'Класически',
  'Лукс',
];

const FINISH_PRESETS = ['Мат', 'Сатен', 'Гланц', 'Релеф', 'Дървесна шарка'];

const PLAN_KEYS: PlanLevel[] = ['free', 'plan_1', 'plan_2', 'plan_3', 'plan_4'];

const ROLE_OPTIONS: UserRole[] = ['user', 'editor', 'admin', 'super_admin'];
const STATUS_OPTIONS: UserStatus[] = ['pending_approval', 'active', 'suspended'];

const pageShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#020617',
  color: '#e2e8f0',
  display: 'grid',
  gridTemplateColumns: '250px 1fr',
  fontFamily: 'inherit',
};

const sidebarStyle: React.CSSProperties = {
  backgroundColor: '#0b1120',
  borderRight: '1px solid #1e293b',
  padding: '18px 14px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: '16px',
};

const mainAreaStyle: React.CSSProperties = {
  padding: '20px 24px 48px',
  maxWidth: '1540px',
  width: '100%',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
};

const panelCardStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '10px',
  padding: '16px',
};

const subBoxStyle: React.CSSProperties = {
  backgroundColor: '#020617',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  padding: '12px',
};

const grid2Style: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px',
};

const grid3Style: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '12px',
};

const grid4Style: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '12px',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #1e293b',
  color: '#94a3b8',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #111827',
  verticalAlign: 'middle',
};

function parseTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

export const AdminPage: React.FC<AdminPageProps> = ({
  currentUser,
  systemSettings,
  onSystemSettingsUpdated,
  onRefreshCurrentUser,
  onCatalogUpdated,
  onExitToStudio,
}) => {
  const hasAdminAccess = canAccessAdminPanel(currentUser);
  const canManageUsers = canManageUsersAndTeams(currentUser);
  const canManageSettings = canManagePlansAndSettings(currentUser);

  const [section, setSection] = useState<AdminSection>(() =>
    canManageUsers ? 'dashboard' : 'models'
  );
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Динамични категории
  const [modelCategories, setModelCategories] = useState<CatalogCategoryItem[]>([]);
  const [textureCategories, setTextureCategories] = useState<CatalogCategoryItem[]>([]);

  // Данни за библиотеки и админ
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [textures, setTextures] = useState<CatalogTexture[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);

  // Управление на категории (модели и текстури)
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categorySlugInput, setCategorySlugInput] = useState('');
  const [categorySortInput, setCategorySortInput] = useState('100');
  const [categorySnapWallInput, setCategorySnapWallInput] = useState(false);

  // Филтри и пагинация за 3D МОДЕЛИ (подготвени за 10 000+ модела)
  const [mSearch, setMSearch] = useState('');
  const [mCategory, setMCategory] = useState('all');
  const [mColor, setMColor] = useState('all');
  const [mMaterial, setMMaterial] = useState('all');
  const [mStyle, setMStyle] = useState('all');
  const [mAccess, setMAccess] = useState<'all' | 'free' | 'premium'>('all');
  const [mStatus, setMStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [mMinW, setMMinW] = useState('');
  const [mMaxW, setMMaxW] = useState('');
  const [mMinD, setMMinD] = useState('');
  const [mMaxD, setMMaxD] = useState('');
  const [mMinH, setMMinH] = useState('');
  const [mMaxH, setMMaxH] = useState('');
  const [mPage, setMPage] = useState(1);
  const [mPageSize, setMPageSize] = useState(24);

  // Форма за 3D модел
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mSku, setMSku] = useState('');
  const [mFormCategory, setMFormCategory] = useState('sofas');
  const [mFormColor, setMFormColor] = useState('');
  const [mFormMaterial, setMFormMaterial] = useState('');
  const [mFormStyle, setMFormStyle] = useState('');
  const [mFormTags, setMFormTags] = useState('');
  const [mWidth, setMWidth] = useState('180');
  const [mHeight, setMHeight] = useState('85');
  const [mDepth, setMDepth] = useState('90');
  const [mScaleMode, setMScaleMode] = useState<ScaleMode>('constrained');
  const [mGlbUrl, setMGlbUrl] = useState('');
  const [mPreviewUrl, setMPreviewUrl] = useState('');
  const [mIsActive, setMIsActive] = useState(true);
  const [mIsPremium, setMIsPremium] = useState(false);

  // Филтри и пагинация за ТЕКСТУРИ
  const [tSearch, setTSearch] = useState('');
  const [tCategory, setTCategory] = useState('all');
  const [tColor, setTColor] = useState('all');
  const [tFinish, setTFinish] = useState('all');
  const [tAccess, setTAccess] = useState<'all' | 'free' | 'premium'>('all');
  const [tStatus, setTStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [tPage, setTPage] = useState(1);
  const [tPageSize, setTPageSize] = useState(24);

  // Форма за текстура
  const [editingTextureId, setEditingTextureId] = useState<string | null>(null);
  const [tName, setTName] = useState('');
  const [tSku, setTSku] = useState('');
  const [tFormCategory, setTFormCategory] = useState('floor');
  const [tFormColor, setTFormColor] = useState('');
  const [tFormFinish, setTFormFinish] = useState('');
  const [tFormTags, setTFormTags] = useState('');
  const [tMapUrl, setTMapUrl] = useState('');
  const [tTileW, setTTileW] = useState('0.60');
  const [tTileH, setTTileH] = useState('0.60');
  const [tRoughness, setTRoughness] = useState('0.45');
  const [tMetalness, setTMetalness] = useState('0.05');
  const [tIsActive, setTIsActive] = useState(true);
  const [tIsPremium, setTIsPremium] = useState(false);

  // Потребители и кредити
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserPlan, setNewUserPlan] = useState<PlanLevel>('free');
  const [newUserCredits, setNewUserCredits] = useState('0');
  const [creditDeltas, setCreditDeltas] = useState<Record<string, string>>({});
  const [creditReasons, setCreditReasons] = useState<Record<string, string>>({});

  // Екипи
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamOwnerId, setNewTeamOwnerId] = useState('');
  const [newTeamCredits, setNewTeamCredits] = useState('200');
  const [newTeamMaxMembers, setNewTeamMaxMembers] = useState('10');
  const [teamCreditDeltas, setTeamCreditDeltas] = useState<Record<string, string>>({});
  const [memberEmailByTeam, setMemberEmailByTeam] = useState<Record<string, string>>({});
  const [memberLimitByTeam, setMemberLimitByTeam] = useState<Record<string, string>>({});

  // Настройки и планове
  const [draftRequireApproval, setDraftRequireApproval] = useState(true);
  const [draftPlans, setDraftPlans] = useState<PlanConfigMap | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setBannerMsg({ type, text });
  };

  const getModelCategoryLabel = useCallback(
    (slug: string) => {
      const found = modelCategories.find((c) => c.slug === slug);
      return found?.name || DEFAULT_CATEGORY_LABELS[slug] || slug;
    },
    [modelCategories]
  );

  const getTextureCategoryLabel = useCallback(
    (slug: string) => {
      const found = textureCategories.find((c) => c.slug === slug);
      return found?.name || DEFAULT_TEXTURE_CATEGORY_LABELS[slug] || slug;
    },
    [textureCategories]
  );

  const loadAllAdminData = useCallback(async () => {
    if (!hasAdminAccess) return;
    setBusy(true);
    try {
      const [catsM, catsT, mdlList, texList] = await Promise.all([
        fetchCategories('model'),
        fetchCategories('texture'),
        fetchModels(),
        fetchTextures(),
      ]);
      setModelCategories(catsM);
      setTextureCategories(catsT);
      setModels(mdlList);
      setTextures(texList);

      if (catsM.length > 0 && !catsM.some((c) => c.slug === mFormCategory)) {
        setMFormCategory(catsM[0].slug);
      }
      if (catsT.length > 0 && !catsT.some((c) => c.slug === tFormCategory)) {
        setTFormCategory(catsT[0].slug);
      }

      if (canManageUsers) {
        const [dashStats, userList, teamList] = await Promise.all([
          fetchAdminDashboard(),
          fetchAdminUsers(),
          fetchTeams(),
        ]);
        setStats(dashStats);
        setUsers(userList);
        setTeams(teamList);
        if (!newTeamOwnerId && userList.length > 0) {
          setNewTeamOwnerId(userList[0].id);
        }
      }
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при зареждане на данните.'
      );
    } finally {
      setBusy(false);
    }
  }, [hasAdminAccess, canManageUsers, mFormCategory, tFormCategory, newTeamOwnerId]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  useEffect(() => {
    if (systemSettings) {
      setDraftRequireApproval(Boolean(systemSettings.requireAdminApproval));
      setDraftPlans(JSON.parse(JSON.stringify(systemSettings.planConfigs)));
    }
  }, [systemSettings]);

  const modelColorOptions = useMemo(() => {
    const set = new Set<string>(COLOR_PRESETS);
    models.forEach((m) => {
      if (m.color && m.color.trim()) set.add(m.color.trim());
    });
    return Array.from(set);
  }, [models]);

  const modelMaterialOptions = useMemo(() => {
    const set = new Set<string>(MATERIAL_PRESETS);
    models.forEach((m) => {
      if (m.material && m.material.trim()) set.add(m.material.trim());
    });
    return Array.from(set);
  }, [models]);

  const modelStyleOptions = useMemo(() => {
    const set = new Set<string>(STYLE_PRESETS);
    models.forEach((m) => {
      if (m.style && m.style.trim()) set.add(m.style.trim());
    });
    return Array.from(set);
  }, [models]);

  const filteredModels = useMemo(() => {
    const q = mSearch.trim().toLowerCase();
    const minW = mMinW.trim() !== '' ? Number(mMinW) : null;
    const maxW = mMaxW.trim() !== '' ? Number(mMaxW) : null;
    const minD = mMinD.trim() !== '' ? Number(mMinD) : null;
    const maxD = mMaxD.trim() !== '' ? Number(mMaxD) : null;
    const minH = mMinH.trim() !== '' ? Number(mMinH) : null;
    const maxH = mMaxH.trim() !== '' ? Number(mMaxH) : null;

    return models.filter((m) => {
      if (mCategory !== 'all' && m.category !== mCategory) return false;
      if (mColor !== 'all' && (m.color || '') !== mColor) return false;
      if (mMaterial !== 'all' && (m.material || '') !== mMaterial) return false;
      if (mStyle !== 'all' && (m.style || '') !== mStyle) return false;
      if (mAccess === 'free' && m.isPremium) return false;
      if (mAccess === 'premium' && !m.isPremium) return false;
      if (mStatus === 'active' && !m.isActive) return false;
      if (mStatus === 'inactive' && m.isActive) return false;

      if (minW !== null && !Number.isNaN(minW) && m.dimensionsCm.width < minW) return false;
      if (maxW !== null && !Number.isNaN(maxW) && m.dimensionsCm.width > maxW) return false;
      if (minD !== null && !Number.isNaN(minD) && m.dimensionsCm.depth < minD) return false;
      if (maxD !== null && !Number.isNaN(maxD) && m.dimensionsCm.depth > maxD) return false;
      if (minH !== null && !Number.isNaN(minH) && m.dimensionsCm.height < minH) return false;
      if (maxH !== null && !Number.isNaN(maxH) && m.dimensionsCm.height > maxH) return false;

      if (q) {
        const hay = [
          m.name,
          m.sku || '',
          m.category,
          getModelCategoryLabel(m.category),
          m.color || '',
          m.material || '',
          m.style || '',
          ...(m.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    models,
    mSearch,
    mCategory,
    mColor,
    mMaterial,
    mStyle,
    mAccess,
    mStatus,
    mMinW,
    mMaxW,
    mMinD,
    mMaxD,
    mMinH,
    mMaxH,
    getModelCategoryLabel,
  ]);

  const mTotalPages = Math.max(1, Math.ceil(filteredModels.length / mPageSize));
  const mSafePage = Math.min(mPage, mTotalPages);
  const pagedModels = useMemo(() => {
    const start = (mSafePage - 1) * mPageSize;
    return filteredModels.slice(start, start + mPageSize);
  }, [filteredModels, mSafePage, mPageSize]);

  useEffect(() => {
    setMPage(1);
  }, [
    mSearch,
    mCategory,
    mColor,
    mMaterial,
    mStyle,
    mAccess,
    mStatus,
    mMinW,
    mMaxW,
    mMinD,
    mMaxD,
    mMinH,
    mMaxH,
    mPageSize,
  ]);

  const textureColorOptions = useMemo(() => {
    const set = new Set<string>(COLOR_PRESETS);
    textures.forEach((t) => {
      if (t.color && t.color.trim()) set.add(t.color.trim());
    });
    return Array.from(set);
  }, [textures]);

  const textureFinishOptions = useMemo(() => {
    const set = new Set<string>(FINISH_PRESETS);
    textures.forEach((t) => {
      if (t.finish && t.finish.trim()) set.add(t.finish.trim());
    });
    return Array.from(set);
  }, [textures]);

  const filteredTextures = useMemo(() => {
    const q = tSearch.trim().toLowerCase();
    return textures.filter((t) => {
      if (tCategory !== 'all' && t.category !== tCategory) return false;
      if (tColor !== 'all' && (t.color || '') !== tColor) return false;
      if (tFinish !== 'all' && (t.finish || '') !== tFinish) return false;
      if (tAccess === 'free' && t.isPremium) return false;
      if (tAccess === 'premium' && !t.isPremium) return false;
      if (tStatus === 'active' && t.isActive === false) return false;
      if (tStatus === 'inactive' && t.isActive !== false) return false;

      if (q) {
        const hay = [
          t.name,
          t.sku || '',
          t.category,
          getTextureCategoryLabel(t.category),
          t.color || '',
          t.finish || '',
          ...(t.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    textures,
    tSearch,
    tCategory,
    tColor,
    tFinish,
    tAccess,
    tStatus,
    getTextureCategoryLabel,
  ]);

  const tTotalPages = Math.max(1, Math.ceil(filteredTextures.length / tPageSize));
  const tSafePage = Math.min(tPage, tTotalPages);
  const pagedTextures = useMemo(() => {
    const start = (tSafePage - 1) * tPageSize;
    return filteredTextures.slice(start, start + tPageSize);
  }, [filteredTextures, tSafePage, tPageSize]);

  useEffect(() => {
    setTPage(1);
  }, [tSearch, tCategory, tColor, tFinish, tAccess, tStatus, tPageSize]);

  // Категории: CRUD
  const activeScope: 'model' | 'texture' =
    section === 'textures' ? 'texture' : 'model';

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryNameInput('');
    setCategorySlugInput('');
    setCategorySortInput('100');
    setCategorySnapWallInput(false);
  };

  const handleStartEditCategory = (cat: CatalogCategoryItem) => {
    setEditingCategoryId(cat.id);
    setCategoryNameInput(cat.name);
    setCategorySlugInput(cat.slug);
    setCategorySortInput(String(cat.sortOrder ?? 100));
    setCategorySnapWallInput(Boolean(cat.snapToWall));
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryNameInput.trim()) return;
    setBusy(true);
    try {
      await saveCategory({
        id: editingCategoryId || undefined,
        slug: editingCategoryId ? undefined : categorySlugInput || undefined,
        name: categoryNameInput.trim(),
        scope: activeScope,
        sortOrder: Number(categorySortInput) || 100,
        snapToWall: activeScope === 'model' ? categorySnapWallInput : false,
      });
      resetCategoryForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', 'Категорията е запазена успешно.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при запис на категория.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategory = async (cat: CatalogCategoryItem) => {
    if (!window.confirm(`Да изтрия ли категорията "${cat.name}"?`)) return;
    setBusy(true);
    try {
      await deleteCategory(cat.id);
      if (editingCategoryId === cat.id) resetCategoryForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', 'Категорията е изтрита.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при изтриване на категория.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Модели: форма и операции
  const resetModelForm = () => {
    setEditingModelId(null);
    setMName('');
    setMSku('');
    setMFormCategory(modelCategories[0]?.slug || 'sofas');
    setMFormColor('');
    setMFormMaterial('');
    setMFormStyle('');
    setMFormTags('');
    setMWidth('180');
    setMHeight('85');
    setMDepth('90');
    setMScaleMode('constrained');
    setMGlbUrl('');
    setMPreviewUrl('');
    setMIsActive(true);
    setMIsPremium(false);
  };

  const handleEditModel = (m: CatalogModel) => {
    setEditingModelId(m.id);
    setMName(m.name);
    setMSku(m.sku || '');
    setMFormCategory(m.category);
    setMFormColor(m.color || '');
    setMFormMaterial(m.material || '');
    setMFormStyle(m.style || '');
    setMFormTags((m.tags || []).join(', '));
    setMWidth(String(m.dimensionsCm.width));
    setMHeight(String(m.dimensionsCm.height));
    setMDepth(String(m.dimensionsCm.depth));
    setMScaleMode(m.scaleMode);
    setMGlbUrl(m.glbUrl || '');
    setMPreviewUrl(m.previewUrl || '');
    setMIsActive(m.isActive);
    setMIsPremium(Boolean(m.isPremium));
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) {
      showToast('error', 'Въведете име на модела.');
      return;
    }
    const w = Math.max(1, Number(mWidth) || 100);
    const h = Math.max(1, Number(mHeight) || 100);
    const d = Math.max(1, Number(mDepth) || 100);

    const payload: CreateModelInput = {
      name: mName.trim(),
      sku: mSku.trim() || undefined,
      category: mFormCategory,
      color: mFormColor.trim() || undefined,
      material: mFormMaterial.trim() || undefined,
      style: mFormStyle.trim() || undefined,
      tags: parseTagsInput(mFormTags),
      dimensionsCm: { width: w, height: h, depth: d },
      scaleMode: mScaleMode,
      scaleConstraints: {
        allowX: mScaleMode !== 'fixed',
        allowY: mScaleMode === 'free',
        allowZ: mScaleMode !== 'fixed',
        minCm: {
          width: Math.max(10, Math.round(w * 0.5)),
          height: Math.max(10, Math.round(h * 0.5)),
          depth: Math.max(10, Math.round(d * 0.5)),
        },
        maxCm: {
          width: Math.max(w, Math.round(w * 2)),
          height: Math.max(h, Math.round(h * 2)),
          depth: Math.max(d, Math.round(d * 2)),
        },
      },
      glbUrl: mGlbUrl.trim() || undefined,
      previewUrl: mPreviewUrl.trim() || undefined,
      isActive: mIsActive,
      isPremium: mIsPremium,
    };

    setBusy(true);
    try {
      if (editingModelId) {
        await updateModel(editingModelId, payload);
      } else {
        await createModel(payload);
      }
      resetModelForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', '3D моделът е запазен в облака.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при запис на 3D модел.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteModel = async (m: CatalogModel) => {
    if (!window.confirm(`Да изтрия ли 3D модела "${m.name}"?`)) return;
    setBusy(true);
    try {
      await deleteModel(m.id);
      if (editingModelId === m.id) resetModelForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', '3D моделът е изтрит.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при изтриване на модел.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Текстури: форма и операции
  const resetTextureForm = () => {
    setEditingTextureId(null);
    setTName('');
    setTSku('');
    setTFormCategory(textureCategories[0]?.slug || 'floor');
    setTFormColor('');
    setTFormFinish('');
    setTFormTags('');
    setTMapUrl('');
    setTTileW('0.60');
    setTTileH('0.60');
    setTRoughness('0.45');
    setTMetalness('0.05');
    setTIsActive(true);
    setTIsPremium(false);
  };

  const handleEditTexture = (t: CatalogTexture) => {
    setEditingTextureId(t.id);
    setTName(t.name);
    setTSku(t.sku || '');
    setTFormCategory(t.category);
    setTFormColor(t.color || '');
    setTFormFinish(t.finish || '');
    setTFormTags((t.tags || []).join(', '));
    setTMapUrl(t.mapUrl);
    setTTileW(String(t.tileWidthM));
    setTTileH(String(t.tileHeightM));
    setTRoughness(String(t.roughness ?? 0.45));
    setTMetalness(String(t.metalness ?? 0.05));
    setTIsActive(t.isActive !== false);
    setTIsPremium(Boolean(t.isPremium));
  };

  const handleSaveTexture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tName.trim() || !tMapUrl.trim()) {
      showToast('error', 'Въведете име и файл/URL за текстурата.');
      return;
    }

    const payload: CreateTextureInput = {
      name: tName.trim(),
      sku: tSku.trim() || undefined,
      category: tFormCategory,
      color: tFormColor.trim() || undefined,
      finish: tFormFinish.trim() || undefined,
      tags: parseTagsInput(tFormTags),
      mapUrl: tMapUrl.trim(),
      tileWidthM: Math.max(0.05, Number(tTileW) || 0.6),
      tileHeightM: Math.max(0.05, Number(tTileH) || 0.6),
      roughness: Math.max(0, Math.min(1, Number(tRoughness) || 0.45)),
      metalness: Math.max(0, Math.min(1, Number(tMetalness) || 0.05)),
      isActive: tIsActive,
      isPremium: tIsPremium,
    };

    setBusy(true);
    try {
      if (editingTextureId) {
        await updateTexture(editingTextureId, payload);
      } else {
        await createTexture(payload);
      }
      resetTextureForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', 'Текстурата е запазена успешно.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при запис на текстура.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTexture = async (t: CatalogTexture) => {
    if (!window.confirm(`Да изтрия ли текстурата "${t.name}"?`)) return;
    setBusy(true);
    try {
      await deleteTexture(t.id);
      if (editingTextureId === t.id) resetTextureForm();
      await loadAllAdminData();
      await onCatalogUpdated();
      showToast('success', 'Текстурата е изтрита.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при изтриване на текстура.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Потребители и кредити
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminCreateUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        role: newUserRole,
        planLevel: newUserPlan,
        aiCreditsBalance: Math.max(0, Number(newUserCredits) || 0),
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserCredits('0');
      await loadAllAdminData();
      showToast('success', 'Потребителят е създаден.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при създаване на потребител.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleApplyCredits = async (u: AuthUser) => {
    const delta = Number(creditDeltas[u.id] || '0');
    if (!delta) {
      showToast('error', 'Въведете брой кредити (напр. 100 или -20).');
      return;
    }
    setBusy(true);
    try {
      await adminAddUserCredits({
        userId: u.id,
        delta,
        reason: creditReasons[u.id] || 'Корекция от администратор',
      });
      setCreditDeltas((prev) => ({ ...prev, [u.id]: '' }));
      await loadAllAdminData();
      await onRefreshCurrentUser();
      showToast('success', `Актуализирани кредити за ${u.name}.`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при начисляване на кредити.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Екипи
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setBusy(true);
    try {
      await createTeam({
        name: newTeamName.trim(),
        ownerUserId: newTeamOwnerId || currentUser?.id,
        sharedAiCredits: Math.max(0, Number(newTeamCredits) || 0),
        maxMembers: Math.max(2, Number(newTeamMaxMembers) || 10),
      });
      setNewTeamName('');
      await loadAllAdminData();
      await onRefreshCurrentUser();
      showToast('success', 'Екипът е създаден.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при създаване на екип.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!draftPlans) return;
    setBusy(true);
    try {
      const updated = await updateSystemSettings({
        requireAdminApproval: draftRequireApproval,
        planConfigs: draftPlans,
      });
      onSystemSettingsUpdated(updated);
      showToast('success', 'Системните настройки и планове са записани.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Грешка при запис на настройките.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (!hasAdminAccess) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#020617',
          color: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ ...panelCardStyle, maxWidth: '460px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Нямате достъп до Админ страницата</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>
            Тази страница изисква роля Editor, Admin или Super Admin.
          </p>
          <button type="button" className="btn btn-active" onClick={onExitToStudio}>
            ← Обратно към 3D Студиото
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      {/* ЛЯВО СТРАНИЧНО МЕНЮ НА ОТДЕЛНАТА АДМИН СТРАНИЦА */}
      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ paddingBottom: '12px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
              ⚙ Studio Admin Center
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {currentUser?.name} · {getRoleLabel(currentUser?.role || 'user')}
            </div>
          </div>

          {canManageUsers && (
            <button
              type="button"
              className={`btn ${section === 'dashboard' ? 'btn-active' : ''}`}
              style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
              onClick={() => {
                setShowCategoryManager(false);
                setSection('dashboard');
              }}
            >
              📊 Dashboard
            </button>
          )}

          <button
            type="button"
            className={`btn ${section === 'models' ? 'btn-active' : ''}`}
            style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
            onClick={() => {
              setShowCategoryManager(false);
              setSection('models');
            }}
          >
            🛋 3D Модели ({models.length})
          </button>

          <button
            type="button"
            className={`btn ${section === 'textures' ? 'btn-active' : ''}`}
            style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
            onClick={() => {
              setShowCategoryManager(false);
              setSection('textures');
            }}
          >
            🎨 Текстури ({textures.length})
          </button>

          {canManageUsers && (
            <>
              <button
                type="button"
                className={`btn ${section === 'users' ? 'btn-active' : ''}`}
                style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
                onClick={() => {
                  setShowCategoryManager(false);
                  setSection('users');
                }}
              >
                👥 Потребители ({users.length})
              </button>

              <button
                type="button"
                className={`btn ${section === 'teams' ? 'btn-active' : ''}`}
                style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
                onClick={() => {
                  setShowCategoryManager(false);
                  setSection('teams');
                }}
              >
                🏢 Екипи ({teams.length})
              </button>
            </>
          )}

          {canManageSettings && (
            <button
              type="button"
              className={`btn ${section === 'settings' ? 'btn-active' : ''}`}
              style={{ justifyContent: 'flex-start', padding: '9px 12px', fontSize: '12.5px' }}
              onClick={() => {
                setShowCategoryManager(false);
                setSection('settings');
              }}
            >
              🛡 Планове и Настройки
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', padding: '9px 12px', fontSize: '12px' }}
            onClick={loadAllAdminData}
            disabled={busy}
          >
            {busy ? 'Обновяване...' : '🔄 Обнови от сървъра'}
          </button>

          <button
            type="button"
            className="btn btn-active"
            style={{ width: '100%', padding: '10px 12px', fontSize: '12.5px', fontWeight: 700 }}
            onClick={onExitToStudio}
          >
            ← Към 3D Студиото
          </button>
        </div>
      </aside>

      {/* ОСНОВНО СЪДЪРЖАНИЕ */}
      <main style={mainAreaStyle}>
        {bannerMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor:
                bannerMsg.type === 'success'
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'rgba(244, 63, 94, 0.16)',
              border:
                bannerMsg.type === 'success'
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : '1px solid rgba(244, 63, 94, 0.45)',
              color: bannerMsg.type === 'success' ? '#a7f3d0' : '#fecdd3',
            }}
          >
            <span>{bannerMsg.text}</span>
            <button
              type="button"
              className="btn"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => setBannerMsg(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* =====================================================================
            1. DASHBOARD
            ===================================================================== */}
        {section === 'dashboard' && canManageUsers && (
          <>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px' }}>Dashboard — Общ преглед</h1>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Централно табло за клауд библиотеката, потребителите, AI кредитите и хостинга
              </p>
            </div>

            <div style={grid4Style}>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Чакащи одобрение</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#fbbf24', marginTop: '4px' }}>
                  {stats?.pendingUsers ?? 0}
                </div>
              </div>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Активни потребители</div>
                <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
                  {stats?.activeUsers ?? 0} / {stats?.totalUsers ?? 0}
                </div>
              </div>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>3D Модели / Текстури</div>
                <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
                  {stats?.totalModels ?? models.length} / {stats?.totalTextures ?? textures.length}
                </div>
              </div>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Дисково пространство (uploads)</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                  {stats?.storageUsedMb ?? 0} MB
                </div>
              </div>
            </div>

            <div style={grid3Style}>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Облачни проекти в БД</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                  {stats?.totalScenes ?? 0}
                </div>
              </div>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Екипи / Агенции</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                  {stats?.totalTeams ?? teams.length}
                </div>
              </div>
              <div style={panelCardStyle}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>AI кредити в обръщение</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#a78bfa', marginTop: '4px' }}>
                  {stats?.totalAiCreditsInCirculation ?? 0}
                </div>
              </div>
            </div>

            <div style={panelCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '14px' }}>Бързи действия</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-active" onClick={() => setSection('models')}>
                    + Добави 3D модел
                  </button>
                  <button type="button" className="btn" onClick={() => setSection('textures')}>
                    + Добави текстура
                  </button>
                  <button type="button" className="btn" onClick={() => setSection('users')}>
                    Преглед на потребители
                  </button>
                </div>
              </div>

              <h4 style={{ margin: '12px 0 8px', fontSize: '13px', color: '#cbd5e1' }}>
                Последни събития и логове
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Време</th>
                      <th style={thStyle}>Потребител</th>
                      <th style={thStyle}>Събитие</th>
                      <th style={thStyle}>Детайли</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats?.recentLogs ?? []).map((log) => (
                      <tr key={log.id}>
                        <td style={tdStyle}>{log.created_at}</td>
                        <td style={tdStyle}>{log.actor_name || log.actor_user_id || '—'}</td>
                        <td style={tdStyle}>
                          <code>{log.event_type}</code>
                        </td>
                        <td style={tdStyle}>{log.details || log.target_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            2. БИБЛИОТЕКА: 3D МОДЕЛИ + КАТЕГОРИИ + ФИЛТРИ + ПАГИНАЦИЯ
            ===================================================================== */}
        {section === 'models' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px' }}>Библиотека: 3D Модели</h1>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Показани <strong>{pagedModels.length}</strong> от <strong>{filteredModels.length}</strong> филтрирани (общо в базата: {models.length})
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn ${showCategoryManager ? 'btn-active' : ''}`}
                  onClick={() => {
                    resetCategoryForm();
                    setShowCategoryManager((prev) => !prev);
                  }}
                >
                  📁 Управление на категории ({modelCategories.length})
                </button>
              </div>
            </div>

            {showCategoryManager && (
              <div style={panelCardStyle}>
                <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>
                  Категории за 3D модели (добавяне, редакция, изтриване)
                </h3>
                <form
                  onSubmit={handleSaveCategory}
                  style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}
                >
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Име на категорията *</label>
                    <input
                      type="text"
                      required
                      className="input-control"
                      value={categoryNameInput}
                      onChange={(e) => setCategoryNameInput(e.target.value)}
                      placeholder="напр. Ъглови дивани"
                    />
                  </div>
                  {!editingCategoryId && (
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Ключ / slug (латиница)</label>
                      <input
                        type="text"
                        className="input-control"
                        value={categorySlugInput}
                        onChange={(e) => setCategorySlugInput(e.target.value)}
                        placeholder="corner-sofas"
                      />
                    </div>
                  )}
                  <div style={{ ...fieldStyle, width: '90px' }}>
                    <label style={labelStyle}>Ред</label>
                    <input
                      type="number"
                      className="input-control"
                      value={categorySortInput}
                      onChange={(e) => setCategorySortInput(e.target.value)}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', paddingBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={categorySnapWallInput}
                      onChange={(e) => setCategorySnapWallInput(e.target.checked)}
                    />
                    Снапване към стена
                  </label>
                  <button type="submit" className="btn btn-active" disabled={busy}>
                    {editingCategoryId ? 'Запази категория' : '+ Добави категория'}
                  </button>
                  {editingCategoryId && (
                    <button type="button" className="btn" onClick={resetCategoryForm}>
                      Отказ
                    </button>
                  )}
                </form>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {modelCategories.map((cat) => (
                    <div
                      key={cat.id}
                      style={{
                        backgroundColor: '#020617',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <span>
                        <strong>{cat.name}</strong>{' '}
                        <span style={{ color: '#64748b' }}>({cat.slug})</span>
                        {cat.snapToWall && (
                          <span style={{ color: '#38bdf8', marginLeft: '4px' }}>[Стена]</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '11px' }}
                        onClick={() => handleStartEditCategory(cat)}
                      >
                        Редакция
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '11px', color: '#fda4af' }}
                        onClick={() => handleDeleteCategory(cat)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ФИЛТРИ ЗА МОДЕЛИ */}
            <div style={panelCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ fontSize: '13px' }}>🔍 Филтри за бързо търсене в каталога</strong>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => {
                    setMSearch('');
                    setMCategory('all');
                    setMColor('all');
                    setMMaterial('all');
                    setMStyle('all');
                    setMAccess('all');
                    setMStatus('all');
                    setMMinW('');
                    setMMaxW('');
                    setMMinD('');
                    setMMaxD('');
                    setMMinH('');
                    setMMaxH('');
                  }}
                >
                  Изчисти всички филтри
                </button>
              </div>

              <div style={grid4Style}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Търсене (име, SKU, таг)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={mSearch}
                    onChange={(e) => setMSearch(e.target.value)}
                    placeholder="напр. диван, SKU-104, букле..."
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Категория</label>
                  <select
                    className="input-control"
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                  >
                    <option value="all">Всички категории</option>
                    {modelCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Цвят</label>
                  <select
                    className="input-control"
                    value={mColor}
                    onChange={(e) => setMColor(e.target.value)}
                  >
                    <option value="all">Всички цветове</option>
                    {modelColorOptions.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Материал / Дамаска</label>
                  <select
                    className="input-control"
                    value={mMaterial}
                    onChange={(e) => setMMaterial(e.target.value)}
                  >
                    <option value="all">Всички материали / дамаски</option>
                    {modelMaterialOptions.map((mat) => (
                      <option key={mat} value={mat}>
                        {mat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ ...grid4Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Стил</label>
                  <select
                    className="input-control"
                    value={mStyle}
                    onChange={(e) => setMStyle(e.target.value)}
                  >
                    <option value="all">Всички стилове</option>
                    {modelStyleOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Ниво на достъп</label>
                  <select
                    className="input-control"
                    value={mAccess}
                    onChange={(e) => setMAccess(e.target.value as 'all' | 'free' | 'premium')}
                  >
                    <option value="all">Всички (Free + Премиум)</option>
                    <option value="free">Само Free</option>
                    <option value="premium">Само ★ Премиум</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Статус</label>
                  <select
                    className="input-control"
                    value={mStatus}
                    onChange={(e) => setMStatus(e.target.value as 'all' | 'active' | 'inactive')}
                  >
                    <option value="all">Всички</option>
                    <option value="active">Само активни</option>
                    <option value="inactive">Само скрити</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>На страница</label>
                  <select
                    className="input-control"
                    value={String(mPageSize)}
                    onChange={(e) => setMPageSize(Number(e.target.value))}
                  >
                    <option value="24">24 модела</option>
                    <option value="48">48 модела</option>
                    <option value="96">96 модела</option>
                  </select>
                </div>
              </div>

              <div style={{ ...grid3Style, marginTop: '10px' }}>
                <div style={subBoxStyle}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Ширина (см): мин – макс
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Мин см"
                      value={mMinW}
                      onChange={(e) => setMMinW(e.target.value)}
                    />
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Макс см"
                      value={mMaxW}
                      onChange={(e) => setMMaxW(e.target.value)}
                    />
                  </div>
                </div>

                <div style={subBoxStyle}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Дълбочина (см): мин – макс
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Мин см"
                      value={mMinD}
                      onChange={(e) => setMMinD(e.target.value)}
                    />
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Макс см"
                      value={mMaxD}
                      onChange={(e) => setMMaxD(e.target.value)}
                    />
                  </div>
                </div>

                <div style={subBoxStyle}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Височина (см): мин – макс
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Мин см"
                      value={mMinH}
                      onChange={(e) => setMMinH(e.target.value)}
                    />
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Макс см"
                      value={mMaxH}
                      onChange={(e) => setMMaxH(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ФОРМА ЗА ДОБАВЯНЕ / РЕДАКЦИЯ НА 3D МОДЕЛ */}
            <form onSubmit={handleSaveModel} style={panelCardStyle}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>
                {editingModelId ? `Редакция на 3D модел (${editingModelId})` : '+ Нов 3D модел в облака'}
              </h3>

              <div style={grid4Style}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Наименование *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    placeholder="напр. Ъглов диван Milan"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Категория *</label>
                  <select
                    className="input-control"
                    value={mFormCategory}
                    onChange={(e) => setMFormCategory(e.target.value)}
                  >
                    {modelCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>SKU / Артикулен номер</label>
                  <input
                    type="text"
                    className="input-control"
                    value={mSku}
                    onChange={(e) => setMSku(e.target.value)}
                    placeholder="напр. SOF-001"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Режим на мащабиране</label>
                  <select
                    className="input-control"
                    value={mScaleMode}
                    onChange={(e) => setMScaleMode(e.target.value as ScaleMode)}
                  >
                    <option value="fixed">Фиксиран (fixed)</option>
                    <option value="constrained">Ограничен (constrained)</option>
                    <option value="free">Свободен (free)</option>
                  </select>
                </div>
              </div>

              <div style={{ ...grid4Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Цвят (за филтриране)</label>
                  <input
                    type="text"
                    list="model-colors-datalist"
                    className="input-control"
                    value={mFormColor}
                    onChange={(e) => setMFormColor(e.target.value)}
                    placeholder="избери или напиши цвят"
                  />
                  <datalist id="model-colors-datalist">
                    {modelColorOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Материал / Дамаска</label>
                  <input
                    type="text"
                    list="model-materials-datalist"
                    className="input-control"
                    value={mFormMaterial}
                    onChange={(e) => setMFormMaterial(e.target.value)}
                    placeholder="напр. Буклен плат, Кадифе, Масив"
                  />
                  <datalist id="model-materials-datalist">
                    {modelMaterialOptions.map((mat) => (
                      <option key={mat} value={mat} />
                    ))}
                  </datalist>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Стил</label>
                  <input
                    type="text"
                    list="model-styles-datalist"
                    className="input-control"
                    value={mFormStyle}
                    onChange={(e) => setMFormStyle(e.target.value)}
                    placeholder="напр. Модерен, Скандинавски"
                  />
                  <datalist id="model-styles-datalist">
                    {modelStyleOptions.map((st) => (
                      <option key={st} value={st} />
                    ))}
                  </datalist>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Тагове (разделени със запетая)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={mFormTags}
                    onChange={(e) => setMFormTags(e.target.value)}
                    placeholder="лежанка, релакс, модулен"
                  />
                </div>
              </div>

              <div style={{ ...grid3Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Ширина (см)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={mWidth}
                    onChange={(e) => setMWidth(e.target.value)}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Височина (см)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={mHeight}
                    onChange={(e) => setMHeight(e.target.value)}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Дълбочина (см)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={mDepth}
                    onChange={(e) => setMDepth(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ ...grid2Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>.GLB файл (URL на хостинга или качване)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="input-control"
                      style={{ flex: 1 }}
                      value={mGlbUrl}
                      onChange={(e) => setMGlbUrl(e.target.value)}
                      placeholder="https://studio.glb3d.com/uploads/models/..."
                    />
                    <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Качи .glb
                      <input
                        type="file"
                        accept=".glb"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setBusy(true);
                          try {
                            const url = await uploadGlbFile(f);
                            setMGlbUrl(url);
                            showToast('success', 'GLB файлът е качен на хостинга.');
                          } catch (err) {
                            showToast('error', err instanceof Error ? err.message : 'Грешка при качване.');
                          } finally {
                            setBusy(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Превю снимка (URL или качване)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="input-control"
                      style={{ flex: 1 }}
                      value={mPreviewUrl}
                      onChange={(e) => setMPreviewUrl(e.target.value)}
                      placeholder="https://studio.glb3d.com/uploads/previews/..."
                    />
                    <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Качи снимка
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setBusy(true);
                          try {
                            const url = await uploadPreviewFile(f);
                            setMPreviewUrl(url);
                            showToast('success', 'Превюто е качено на хостинга.');
                          } catch (err) {
                            showToast('error', err instanceof Error ? err.message : 'Грешка при качване.');
                          } finally {
                            setBusy(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12.5px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mIsActive}
                      onChange={(e) => setMIsActive(e.target.checked)}
                    />
                    Активен в каталога
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fbbf24' }}>
                    <input
                      type="checkbox"
                      checked={mIsPremium}
                      onChange={(e) => setMIsPremium(e.target.checked)}
                    />
                    ★ Премиум модел (за платени планове)
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingModelId && (
                    <button type="button" className="btn" onClick={resetModelForm}>
                      Отказ от редакция
                    </button>
                  )}
                  <button type="submit" className="btn btn-active" disabled={busy}>
                    {editingModelId ? 'Запази промените' : '+ Запази 3D модел'}
                  </button>
                </div>
              </div>
            </form>

            {/* ТАБЛИЦА С МОДЕЛИ + ПАГИНАЦИЯ */}
            <div style={panelCardStyle}>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Превю</th>
                      <th style={thStyle}>Модел / SKU</th>
                      <th style={thStyle}>Категория</th>
                      <th style={thStyle}>Цвят / Материал / Стил</th>
                      <th style={thStyle}>Размери (Ш×В×Д см)</th>
                      <th style={thStyle}>Достъп / Статус</th>
                      <th style={thStyle}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedModels.map((m) => (
                      <tr key={m.id}>
                        <td style={tdStyle}>
                          {m.previewUrl ? (
                            <img
                              src={m.previewUrl}
                              alt={m.name}
                              style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '6px',
                                backgroundColor: '#1e293b',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                              }}
                            >
                              📦
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{m.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {m.sku ? `SKU: ${m.sku}` : m.id}
                          </div>
                        </td>
                        <td style={tdStyle}>{getModelCategoryLabel(m.category)}</td>
                        <td style={tdStyle}>
                          <div>{[m.color, m.material].filter(Boolean).join(' · ') || '—'}</div>
                          {m.style && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.style}</div>}
                        </td>
                        <td style={tdStyle}>
                          {m.dimensionsCm.width} × {m.dimensionsCm.height} × {m.dimensionsCm.depth}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {m.isPremium && (
                              <span style={{ color: '#fbbf24', fontWeight: 600 }}>★ Премиум</span>
                            )}
                            <span style={{ color: m.isActive ? '#34d399' : '#94a3b8' }}>
                              {m.isActive ? 'Активен' : 'Скрит'}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              onClick={() => handleEditModel(m)}
                            >
                              Редакция
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '11.5px', color: '#fda4af' }}
                              onClick={() => handleDeleteModel(m)}
                            >
                              Изтрий
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pagedModels.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                          Няма намерени модели по избраните филтри.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <span>
                  Страница <strong>{mSafePage}</strong> от <strong>{mTotalPages}</strong>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={mSafePage <= 1}
                    onClick={() => setMPage((p) => Math.max(1, p - 1))}
                  >
                    ← Предишна
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={mSafePage >= mTotalPages}
                    onClick={() => setMPage((p) => Math.min(mTotalPages, p + 1))}
                  >
                    Следваща →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            3. БИБЛИОТЕКА: ТЕКСТУРИ + КАТЕГОРИИ + ФИЛТРИ + ПАГИНАЦИЯ
            ===================================================================== */}
        {section === 'textures' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px' }}>Библиотека: Текстури</h1>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Показани <strong>{pagedTextures.length}</strong> от <strong>{filteredTextures.length}</strong> филтрирани (общо в базата: {textures.length})
                </p>
              </div>
              <button
                type="button"
                className={`btn ${showCategoryManager ? 'btn-active' : ''}`}
                onClick={() => {
                  resetCategoryForm();
                  setShowCategoryManager((prev) => !prev);
                }}
              >
                📁 Управление на категории ({textureCategories.length})
              </button>
            </div>

            {showCategoryManager && (
              <div style={panelCardStyle}>
                <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>
                  Категории за текстури (добавяне, редакция, изтриване)
                </h3>
                <form
                  onSubmit={handleSaveCategory}
                  style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}
                >
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Име на категорията *</label>
                    <input
                      type="text"
                      required
                      className="input-control"
                      value={categoryNameInput}
                      onChange={(e) => setCategoryNameInput(e.target.value)}
                      placeholder="напр. Дамаски и текстил"
                    />
                  </div>
                  {!editingCategoryId && (
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Ключ / slug (латиница)</label>
                      <input
                        type="text"
                        className="input-control"
                        value={categorySlugInput}
                        onChange={(e) => setCategorySlugInput(e.target.value)}
                        placeholder="fabrics"
                      />
                    </div>
                  )}
                  <div style={{ ...fieldStyle, width: '90px' }}>
                    <label style={labelStyle}>Ред</label>
                    <input
                      type="number"
                      className="input-control"
                      value={categorySortInput}
                      onChange={(e) => setCategorySortInput(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-active" disabled={busy}>
                    {editingCategoryId ? 'Запази категория' : '+ Добави категория'}
                  </button>
                  {editingCategoryId && (
                    <button type="button" className="btn" onClick={resetCategoryForm}>
                      Отказ
                    </button>
                  )}
                </form>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {textureCategories.map((cat) => (
                    <div
                      key={cat.id}
                      style={{
                        backgroundColor: '#020617',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <span>
                        <strong>{cat.name}</strong>{' '}
                        <span style={{ color: '#64748b' }}>({cat.slug})</span>
                      </span>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '11px' }}
                        onClick={() => handleStartEditCategory(cat)}
                      >
                        Редакция
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '11px', color: '#fda4af' }}
                        onClick={() => handleDeleteCategory(cat)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ФИЛТРИ ЗА ТЕКСТУРИ */}
            <div style={panelCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ fontSize: '13px' }}>🔍 Филтри за текстури</strong>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => {
                    setTSearch('');
                    setTCategory('all');
                    setTColor('all');
                    setTFinish('all');
                    setTAccess('all');
                    setTStatus('all');
                  }}
                >
                  Изчисти филтрите
                </button>
              </div>

              <div style={grid4Style}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Търсене (име, SKU, таг)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={tSearch}
                    onChange={(e) => setTSearch(e.target.value)}
                    placeholder="напр. дъб, мрамор, букле..."
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Категория</label>
                  <select
                    className="input-control"
                    value={tCategory}
                    onChange={(e) => setTCategory(e.target.value)}
                  >
                    <option value="all">Всички категории</option>
                    {textureCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Цвят</label>
                  <select
                    className="input-control"
                    value={tColor}
                    onChange={(e) => setTColor(e.target.value)}
                  >
                    <option value="all">Всички цветове</option>
                    {textureColorOptions.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Повърхност / Финиш</label>
                  <select
                    className="input-control"
                    value={tFinish}
                    onChange={(e) => setTFinish(e.target.value)}
                  >
                    <option value="all">Всички повърхности</option>
                    {textureFinishOptions.map((fin) => (
                      <option key={fin} value={fin}>
                        {fin}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ ...grid3Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Достъп</label>
                  <select
                    className="input-control"
                    value={tAccess}
                    onChange={(e) => setTAccess(e.target.value as 'all' | 'free' | 'premium')}
                  >
                    <option value="all">Всички</option>
                    <option value="free">Само Free</option>
                    <option value="premium">Само ★ Премиум</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Статус</label>
                  <select
                    className="input-control"
                    value={tStatus}
                    onChange={(e) => setTStatus(e.target.value as 'all' | 'active' | 'inactive')}
                  >
                    <option value="all">Всички</option>
                    <option value="active">Активни</option>
                    <option value="inactive">Скрити</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>На страница</label>
                  <select
                    className="input-control"
                    value={String(tPageSize)}
                    onChange={(e) => setTPageSize(Number(e.target.value))}
                  >
                    <option value="24">24 текстури</option>
                    <option value="48">48 текстури</option>
                    <option value="96">96 текстури</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ФОРМА ЗА ТЕКСТУРА */}
            <form onSubmit={handleSaveTexture} style={panelCardStyle}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>
                {editingTextureId ? `Редакция на текстура (${editingTextureId})` : '+ Нова текстура'}
              </h3>

              <div style={grid4Style}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Наименование *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    placeholder="напр. Естествен дъб мат"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Категория *</label>
                  <select
                    className="input-control"
                    value={tFormCategory}
                    onChange={(e) => setTFormCategory(e.target.value)}
                  >
                    {textureCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Цвят</label>
                  <input
                    type="text"
                    list="tex-colors-datalist"
                    className="input-control"
                    value={tFormColor}
                    onChange={(e) => setTFormColor(e.target.value)}
                    placeholder="напр. Дъб, Сив, Бял"
                  />
                  <datalist id="tex-colors-datalist">
                    {textureColorOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Повърхност / Финиш</label>
                  <input
                    type="text"
                    list="tex-finishes-datalist"
                    className="input-control"
                    value={tFormFinish}
                    onChange={(e) => setTFormFinish(e.target.value)}
                    placeholder="напр. Мат, Сатен, Гланц"
                  />
                  <datalist id="tex-finishes-datalist">
                    {textureFinishOptions.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div style={{ ...grid4Style, marginTop: '10px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>SKU / Код</label>
                  <input
                    type="text"
                    className="input-control"
                    value={tSku}
                    onChange={(e) => setTSku(e.target.value)}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Тагове (запетая)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={tFormTags}
                    onChange={(e) => setTFormTags(e.target.value)}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Рапорт Ширина / Височина (м)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      step="0.05"
                      className="input-control"
                      value={tTileW}
                      onChange={(e) => setTTileW(e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.05"
                      className="input-control"
                      value={tTileH}
                      onChange={(e) => setTTileH(e.target.value)}
                    />
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Грапавост (Roughness 0–1)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="input-control"
                    value={tRoughness}
                    onChange={(e) => setTRoughness(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ ...fieldStyle, marginTop: '10px' }}>
                <label style={labelStyle}>Изображение на текстурата (URL или качване) *</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    required
                    className="input-control"
                    style={{ flex: 1 }}
                    value={tMapUrl}
                    onChange={(e) => setTMapUrl(e.target.value)}
                    placeholder="https://studio.glb3d.com/uploads/textures/..."
                  />
                  <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Качи текстура
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setBusy(true);
                        try {
                          const url = await uploadTextureFile(f);
                          setTMapUrl(url);
                          showToast('success', 'Текстурата е качена на хостинга.');
                        } catch (err) {
                          showToast('error', err instanceof Error ? err.message : 'Грешка при качване.');
                        } finally {
                          setBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12.5px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={tIsActive}
                      onChange={(e) => setTIsActive(e.target.checked)}
                    />
                    Активна
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fbbf24' }}>
                    <input
                      type="checkbox"
                      checked={tIsPremium}
                      onChange={(e) => setTIsPremium(e.target.checked)}
                    />
                    ★ Премиум текстура
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingTextureId && (
                    <button type="button" className="btn" onClick={resetTextureForm}>
                      Отказ
                    </button>
                  )}
                  <button type="submit" className="btn btn-active" disabled={busy}>
                    {editingTextureId ? 'Запази промените' : '+ Запази текстура'}
                  </button>
                </div>
              </div>
            </form>

            {/* ТАБЛИЦА С ТЕКСТУРИ + ПАГИНАЦИЯ */}
            <div style={panelCardStyle}>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Превю</th>
                      <th style={thStyle}>Наименование</th>
                      <th style={thStyle}>Категория</th>
                      <th style={thStyle}>Цвят / Финиш</th>
                      <th style={thStyle}>Рапорт (м)</th>
                      <th style={thStyle}>Достъп</th>
                      <th style={thStyle}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTextures.map((t) => (
                      <tr key={t.id}>
                        <td style={tdStyle}>
                          <img
                            src={t.mapUrl}
                            alt={t.name}
                            style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px' }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <strong>{t.name}</strong>
                          {t.sku && <div style={{ fontSize: '11px', color: '#94a3b8' }}>SKU: {t.sku}</div>}
                        </td>
                        <td style={tdStyle}>{getTextureCategoryLabel(t.category)}</td>
                        <td style={tdStyle}>{[t.color, t.finish].filter(Boolean).join(' · ') || '—'}</td>
                        <td style={tdStyle}>
                          {t.tileWidthM} × {t.tileHeightM} м
                        </td>
                        <td style={tdStyle}>
                          {t.isPremium ? (
                            <span style={{ color: '#fbbf24', fontWeight: 600 }}>★ Премиум</span>
                          ) : (
                            <span style={{ color: '#34d399' }}>Free</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              onClick={() => handleEditTexture(t)}
                            >
                              Редакция
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '11.5px', color: '#fda4af' }}
                              onClick={() => handleDeleteTexture(t)}
                            >
                              Изтрий
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pagedTextures.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                          Няма намерени текстури по избраните филтри.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <span>
                  Страница <strong>{tSafePage}</strong> от <strong>{tTotalPages}</strong>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={tSafePage <= 1}
                    onClick={() => setTPage((p) => Math.max(1, p - 1))}
                  >
                    ← Предишна
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={tSafePage >= tTotalPages}
                    onClick={() => setTPage((p) => Math.min(tTotalPages, p + 1))}
                  >
                    Следваща →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            4. ПОТРЕБИТЕЛИ, РОЛИ, ПЛАНОВЕ И AI КРЕДИТИ
            ===================================================================== */}
        {section === 'users' && canManageUsers && (
          <>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px' }}>Потребители, Роли, Планове и AI Кредити</h1>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Одобрение на нови регистрации, промяна на нива и ръчно зареждане на AI кредити
              </p>
            </div>

            <form onSubmit={handleCreateUser} style={panelCardStyle}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>+ Ръчно създаване на потребител</h3>
              <div style={grid4Style}>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Име и фамилия"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <input
                  type="email"
                  required
                  className="input-control"
                  placeholder="Имейл"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input-control"
                  placeholder="Парола (мин. 6 символа)"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    className="input-control"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {getRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input-control"
                    value={newUserPlan}
                    onChange={(e) => setNewUserPlan(e.target.value as PlanLevel)}
                  >
                    {PLAN_KEYS.map((p) => (
                      <option key={p} value={p}>
                        {getPlanLabel(p, systemSettings?.planConfigs)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  className="input-control"
                  style={{ width: '160px' }}
                  placeholder="Начални AI кредити"
                  value={newUserCredits}
                  onChange={(e) => setNewUserCredits(e.target.value)}
                />
                <button type="submit" className="btn btn-active" disabled={busy}>
                  Създай профил
                </button>
              </div>
            </form>

            <div style={panelCardStyle}>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Потребител</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>Роля</th>
                      <th style={thStyle}>План</th>
                      <th style={thStyle}>AI Кредити (Лични / Общо)</th>
                      <th style={thStyle}>Добави / Приспаднати кредити</th>
                      <th style={thStyle}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={tdStyle}>
                          <strong>{u.name}</strong>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email}</div>
                        </td>
                        <td style={tdStyle}>
                          <select
                            className="input-control"
                            style={{ fontSize: '11.5px', padding: '4px 6px' }}
                            value={u.status}
                            onChange={async (e) => {
                              setBusy(true);
                              try {
                                await adminUpdateUser({
                                  id: u.id,
                                  status: e.target.value as UserStatus,
                                });
                                await loadAllAdminData();
                                showToast('success', 'Статусът е обновен.');
                              } catch (err) {
                                showToast('error', err instanceof Error ? err.message : 'Грешка.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st === 'pending_approval'
                                  ? '⏳ Чака одобрение'
                                  : st === 'active'
                                    ? '✅ Активен'
                                    : '⛔ Спрян'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select
                            className="input-control"
                            style={{ fontSize: '11.5px', padding: '4px 6px' }}
                            value={u.role}
                            onChange={async (e) => {
                              setBusy(true);
                              try {
                                await adminUpdateUser({
                                  id: u.id,
                                  role: e.target.value as UserRole,
                                });
                                await loadAllAdminData();
                                showToast('success', 'Ролята е обновена.');
                              } catch (err) {
                                showToast('error', err instanceof Error ? err.message : 'Грешка.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {getRoleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select
                            className="input-control"
                            style={{ fontSize: '11.5px', padding: '4px 6px' }}
                            value={u.planLevel}
                            onChange={async (e) => {
                              setBusy(true);
                              try {
                                await adminUpdateUser({
                                  id: u.id,
                                  planLevel: e.target.value as PlanLevel,
                                });
                                await loadAllAdminData();
                                showToast('success', 'Планът е обновен.');
                              } catch (err) {
                                showToast('error', err instanceof Error ? err.message : 'Грешка.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {PLAN_KEYS.map((p) => (
                              <option key={p} value={p}>
                                {getPlanLabel(p, systemSettings?.planConfigs)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <strong>{u.aiCreditsBalance}</strong> лични ·{' '}
                          <span style={{ color: '#a78bfa' }}>{u.totalAvailableCredits}</span> общо
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                              type="number"
                              className="input-control"
                              style={{ width: '74px', padding: '4px 6px', fontSize: '11.5px' }}
                              placeholder="+50"
                              value={creditDeltas[u.id] || ''}
                              onChange={(e) =>
                                setCreditDeltas((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                            />
                            <input
                              type="text"
                              className="input-control"
                              style={{ width: '110px', padding: '4px 6px', fontSize: '11.5px' }}
                              placeholder="Причина"
                              value={creditReasons[u.id] || ''}
                              onChange={(e) =>
                                setCreditReasons((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-active"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              onClick={() => handleApplyCredits(u)}
                            >
                              OK
                            </button>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {u.status === 'pending_approval' && (
                              <button
                                type="button"
                                className="btn btn-active"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await adminUpdateUser({ id: u.id, status: 'active' });
                                    await loadAllAdminData();
                                    showToast('success', `${u.name} е одобрен.`);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Одобри
                              </button>
                            )}
                            {currentUser?.role === 'super_admin' && u.id !== currentUser.id && (
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '4px 8px', fontSize: '11px', color: '#fda4af' }}
                                onClick={async () => {
                                  if (!window.confirm(`Изтриване на ${u.email}?`)) return;
                                  setBusy(true);
                                  try {
                                    await adminDeleteUser(u.id);
                                    await loadAllAdminData();
                                    showToast('success', 'Потребителят е изтрит.');
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Изтрий
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            5. ЕКИПИ И АГЕНЦИИ
            ===================================================================== */}
        {section === 'teams' && canManageUsers && (
          <>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px' }}>Екипи и Агенции</h1>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Създаване на екипи, общ пул AI кредити и разпределение на лимити към членовете
              </p>
            </div>

            <form onSubmit={handleCreateTeam} style={panelCardStyle}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>+ Създай нов екип / агенция</h3>
              <div style={grid4Style}>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Име на екипа / студиото"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <select
                  className="input-control"
                  value={newTeamOwnerId}
                  onChange={(e) => setNewTeamOwnerId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      Мениджър: {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input-control"
                  placeholder="Начални общи AI кредити"
                  value={newTeamCredits}
                  onChange={(e) => setNewTeamCredits(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="number"
                    className="input-control"
                    placeholder="Макс. членове"
                    value={newTeamMaxMembers}
                    onChange={(e) => setNewTeamMaxMembers(e.target.value)}
                  />
                  <button type="submit" className="btn btn-active" disabled={busy}>
                    Създай
                  </button>
                </div>
              </div>
            </form>

            {teams.map((t) => (
              <div key={t.id} style={panelCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px' }}>{t.name}</h3>
                    <div style={{ fontSize: '12px', color: '#a78bfa' }}>
                      Общ пул AI кредити: <strong>{t.sharedAiCredits}</strong> · Членове: {t.members.length}/{t.maxMembers}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      className="input-control"
                      style={{ width: '100px' }}
                      placeholder="+ кредити"
                      value={teamCreditDeltas[t.id] || ''}
                      onChange={(e) =>
                        setTeamCreditDeltas((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-active"
                      onClick={async () => {
                        const d = Number(teamCreditDeltas[t.id] || '0');
                        if (!d) return;
                        setBusy(true);
                        try {
                          await addTeamCredits({ teamId: t.id, delta: d });
                          setTeamCreditDeltas((prev) => ({ ...prev, [t.id]: '' }));
                          await loadAllAdminData();
                          showToast('success', 'Пулът от AI кредити за екипа е обновен.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Зареди пул
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <input
                    type="email"
                    className="input-control"
                    style={{ width: '240px' }}
                    placeholder="Имейл на съществуващ потребител"
                    value={memberEmailByTeam[t.id] || ''}
                    onChange={(e) =>
                      setMemberEmailByTeam((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                  />
                  <input
                    type="number"
                    className="input-control"
                    style={{ width: '140px' }}
                    placeholder="Лимит кредити"
                    value={memberLimitByTeam[t.id] || '50'}
                    onChange={(e) =>
                      setMemberLimitByTeam((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const email = (memberEmailByTeam[t.id] || '').trim();
                      if (!email) return;
                      setBusy(true);
                      try {
                        await manageTeamMember({
                          teamId: t.id,
                          email,
                          subAction: 'upsert',
                          creditLimit: Math.max(0, Number(memberLimitByTeam[t.id]) || 0),
                        });
                        setMemberEmailByTeam((prev) => ({ ...prev, [t.id]: '' }));
                        await loadAllAdminData();
                        showToast('success', 'Членът на екипа е добавен/обновен.');
                      } catch (err) {
                        showToast('error', err instanceof Error ? err.message : 'Грешка.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    + Добави / Обнови член
                  </button>
                </div>

                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Член</th>
                      <th style={thStyle}>Роля в екипа</th>
                      <th style={thStyle}>Лимит / Използвани</th>
                      <th style={thStyle}>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.members.map((m: TeamMember) => (
                      <tr key={m.id}>
                        <td style={tdStyle}>
                          {m.name} ({m.email})
                        </td>
                        <td style={tdStyle}>{m.teamRole === 'owner' ? 'Мениджър' : 'Член'}</td>
                        <td style={tdStyle}>
                          {m.teamRole === 'owner'
                            ? 'Пълен достъп до пула'
                            : `${m.teamCreditsUsed} / ${m.teamCreditLimit}`}
                        </td>
                        <td style={tdStyle}>
                          {m.teamRole !== 'owner' && (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '3px 8px', fontSize: '11px', color: '#fda4af' }}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await manageTeamMember({
                                    teamId: t.id,
                                    userId: m.id,
                                    subAction: 'remove',
                                  });
                                  await loadAllAdminData();
                                  showToast('success', 'Членът е премахнат от екипа.');
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Премахни
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {/* =====================================================================
            6. ПЛАНОВЕ И СИСТЕМНИ НАСТРОЙКИ
            ===================================================================== */}
        {section === 'settings' && canManageSettings && draftPlans && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px' }}>Планове и Системни настройки</h1>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Одобрение на нови регистрации и лимити за Free + Нива 1–4
                </p>
              </div>
              <button type="button" className="btn btn-active" disabled={busy} onClick={handleSaveSettings}>
                💾 Запази настройките
              </button>
            </div>

            <div style={panelCardStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={draftRequireApproval}
                  onChange={(e) => setDraftRequireApproval(e.target.checked)}
                />
                Изисквай одобрение от администратор за нови регистрации (`requireAdminApproval`)
              </label>
            </div>

            <div style={grid2Style}>
              {PLAN_KEYS.map((pKey) => {
                const cfg = draftPlans[pKey];
                if (!cfg) return null;
                return (
                  <div key={pKey} style={panelCardStyle}>
                    <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>{cfg.label}</h3>
                    <div style={grid2Style}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Макс. проекти</label>
                        <input
                          type="number"
                          className="input-control"
                          value={cfg.maxProjects}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], maxProjects: Number(e.target.value) || 0 },
                                  }
                                : prev
                            )
                          }
                        />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Месечни AI кредити</label>
                        <input
                          type="number"
                          className="input-control"
                          value={cfg.monthlyAiCredits}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], monthlyAiCredits: Number(e.target.value) || 0 },
                                  }
                                : prev
                            )
                          }
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', fontSize: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={cfg.allowPremiumCatalog}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], allowPremiumCatalog: e.target.checked },
                                  }
                                : prev
                            )
                          }
                        />
                        Достъп до ★ Премиум каталог
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={cfg.allowParametricGenerators}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], allowParametricGenerators: e.target.checked },
                                  }
                                : prev
                            )
                          }
                        />
                        Параметрични генератори (кухни / гардероби)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={cfg.allowBomExport}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], allowBomExport: e.target.checked },
                                  }
                                : prev
                            )
                          }
                        />
                        Експорт на BOM спецификация
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={cfg.allowTeams}
                          onChange={(e) =>
                            setDraftPlans((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [pKey]: { ...prev[pKey], allowTeams: e.target.checked },
                                  }
                                : prev
                            )
                          }
                        />
                        Създаване и управление на екипи
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};