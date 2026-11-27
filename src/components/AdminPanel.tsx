import React, { useCallback, useEffect, useState } from 'react';
import { CATEGORY_LABELS } from '../types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  ModelCategory,
  ScaleMode,
} from '../types/editor';
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
import type { RoomConfig } from '../types/room';
import { getEffectivePermissions } from '../utils/permissions';
import {
  addAdminUserCredits,
  addTeamCredits,
  createAdminUser,
  createModelOnServer,
  createTeam,
  createTextureOnServer,
  deleteAdminUser,
  deleteModelOnServer,
  deleteTextureOnServer,
  fetchAdminDashboardStats,
  fetchAdminUsers,
  fetchModels,
  fetchTeams,
  fetchTextures,
  manageTeamMember,
  updateAdminUser,
  updateModelOnServer,
  updateSystemSettings,
  updateTextureOnServer,
  uploadGlbFile,
  uploadPreviewImage,
  uploadTextureImage,
} from '../utils/apiClient';

interface AdminPanelProps {
  models: CatalogModel[];
  currentRoom?: RoomConfig;
  currentUser?: AuthUser | null;
  systemSettings?: SystemSettings | null;
  onSettingsUpdated?: (settings: SystemSettings) => void;
  onUserUpdated?: (user: AuthUser) => void;
  onClose: () => void;
  onModelsUpdated: () => void;
}

type AdminTab = 'users' | 'teams' | 'settings' | 'models' | 'textures';

const PLAN_KEYS: PlanLevel[] = ['free', 'plan_1', 'plan_2', 'plan_3', 'plan_4'];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  editor: 'Редактор',
  user: 'Потребител',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  pending_approval: '⏳ Чака одобрение',
  active: '✅ Активен',
  suspended: '⛔ Спрян',
};

const EMPTY_MODEL_FORM = {
  name: '',
  category: 'sofa' as ModelCategory,
  widthCm: 200,
  heightCm: 85,
  depthCm: 95,
  scaleMode: 'constrained' as ScaleMode,
  allowX: true,
  allowY: false,
  allowZ: true,
  minWidthCm: 100,
  maxWidthCm: 400,
  minHeightCm: 40,
  maxHeightCm: 250,
  minDepthCm: 50,
  maxDepthCm: 250,
  glbUrl: '',
  previewUrl: '',
  isActive: true,
  isPremium: false,
};

const EMPTY_TEXTURE_FORM = {
  name: '',
  category: 'floor' as 'floor' | 'tiles' | 'wall',
  mapUrl: '',
  tileWidthCm: 60,
  tileHeightCm: 60,
  roughness: 0.55,
  metalness: 0.05,
  isActive: true,
  isPremium: false,
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  models: initialModels,
  currentUser = null,
  systemSettings = null,
  onSettingsUpdated,
  onUserUpdated,
  onClose,
  onModelsUpdated,
}) => {
  const permissions = getEffectivePermissions(currentUser ?? null, systemSettings ?? null);

  const defaultTab: AdminTab = permissions.canManageUsersAndSettings
    ? 'users'
    : permissions.canManageTeam
      ? 'teams'
      : 'models';

  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Потребители, статистика и логове
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [newUserPlan, setNewUserPlan] = useState<PlanLevel>('free');
  const [newUserCredits, setNewUserCredits] = useState(0);
  const [creditDeltasByUser, setCreditDeltasByUser] = useState<Record<string, number>>({});

  // Екипи / агенции
  const [teams, setTeams] = useState<TeamDetails[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamOwnerId, setNewTeamOwnerId] = useState('');
  const [newTeamCredits, setNewTeamCredits] = useState(100);
  const [teamCreditDeltaById, setTeamCreditDeltaById] = useState<Record<string, number>>({});
  const [memberEmailByTeam, setMemberEmailByTeam] = useState<Record<string, string>>({});
  const [memberLimitByTeam, setMemberLimitByTeam] = useState<Record<string, number>>({});

  // Системни настройки
  const [draftSettings, setDraftSettings] = useState<SystemSettings | null>(systemSettings ?? null);

  useEffect(() => {
    if (systemSettings) {
      setDraftSettings(systemSettings);
    }
  }, [systemSettings]);

  // 3D модели и текстури
  const [models, setModels] = useState<CatalogModel[]>(initialModels);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState(EMPTY_MODEL_FORM);
  const [textures, setTextures] = useState<CatalogTexture[]>([]);
  const [editingTextureId, setEditingTextureId] = useState<string | null>(null);
  const [textureForm, setTextureForm] = useState(EMPTY_TEXTURE_FORM);

  const loadAdminData = useCallback(async () => {
    setIsBusy(true);
    try {
      const promises: Promise<unknown>[] = [];

      if (permissions.canManageUsersAndSettings) {
        promises.push(
          fetchAdminDashboardStats().then((d) => {
            setStats(d.stats);
            setRecentLogs(d.recentLogs);
          }),
          fetchAdminUsers().then((u) => {
            setUsers(u);
            if (!newTeamOwnerId && u.length > 0) {
              setNewTeamOwnerId(u[0].id);
            }
          })
        );
      }

      if (permissions.canManageTeam) {
        promises.push(fetchTeams().then((t) => setTeams(t)));
      }

      if (permissions.canEditCatalog) {
        promises.push(
          fetchModels().then((m) => setModels(m)),
          fetchTextures().then((tx) => setTextures(tx))
        );
      }

      await Promise.allSettled(promises);
    } finally {
      setIsBusy(false);
    }
  }, [permissions.canManageUsersAndSettings, permissions.canManageTeam, permissions.canEditCatalog, newTeamOwnerId]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const notifyOk = (msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
  };

  const notifyErr = (err: unknown) => {
    setStatusMessage(null);
    setErrorMessage(err instanceof Error ? err.message : 'Възникна грешка.');
  };

  // --- Потребители ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsBusy(true);
      await createAdminUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        planLevel: newUserPlan,
        aiCreditsBalance: newUserCredits,
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserCredits(0);
      await loadAdminData();
      notifyOk('Потребителят е създаден успешно.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickUserPatch = async (
    userId: string,
    patch: { status?: UserStatus; role?: UserRole; planLevel?: PlanLevel }
  ) => {
    try {
      setIsBusy(true);
      const updated = await updateAdminUser({ id: userId, ...patch });
      if (currentUser && currentUser.id === updated.id && onUserUpdated) {
        onUserUpdated(updated);
      }
      await loadAdminData();
      notifyOk(`Профилът на ${updated.name} е обновен.`);
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleApplyCredits = async (userId: string) => {
    const delta = creditDeltasByUser[userId] ?? 0;
    if (delta === 0) return;
    try {
      setIsBusy(true);
      const updated = await addAdminUserCredits({
        userId,
        delta,
        reason: 'Ръчно зареждане от администратор',
      });
      if (currentUser && currentUser.id === updated.id && onUserUpdated) {
        onUserUpdated(updated);
      }
      setCreditDeltasByUser((prev) => ({ ...prev, [userId]: 0 }));
      await loadAdminData();
      notifyOk(`Балансът на ${updated.name} е актуализиран (${delta > 0 ? `+${delta}` : delta}).`);
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  // --- Екипи ---
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsBusy(true);
      await createTeam({
        name: newTeamName,
        ownerUserId: newTeamOwnerId || currentUser?.id,
        sharedAiCredits: newTeamCredits,
      });
      setNewTeamName('');
      await loadAdminData();
      notifyOk('Екипът / агенцията е създаден.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  // --- Модели ---
  const resetModelForm = () => {
    setEditingModelId(null);
    setModelForm(EMPTY_MODEL_FORM);
  };

  const startEditModel = (m: CatalogModel) => {
    setEditingModelId(m.id);
    const sc = m.scaleConstraints;
    setModelForm({
      name: m.name,
      category: m.category,
      widthCm: m.dimensionsCm.width,
      heightCm: m.dimensionsCm.height,
      depthCm: m.dimensionsCm.depth,
      scaleMode: m.scaleMode,
      allowX: sc?.allowX ?? true,
      allowY: sc?.allowY ?? false,
      allowZ: sc?.allowZ ?? true,
      minWidthCm: sc?.minCm?.width ?? 50,
      maxWidthCm: sc?.maxCm?.width ?? 500,
      minHeightCm: sc?.minCm?.height ?? 30,
      maxHeightCm: sc?.maxCm?.height ?? 300,
      minDepthCm: sc?.minCm?.depth ?? 40,
      maxDepthCm: sc?.maxCm?.depth ?? 300,
      glbUrl: m.glbUrl ?? '',
      previewUrl: m.previewUrl ?? '',
      isActive: m.isActive,
      isPremium: Boolean(m.isPremium),
    });
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsBusy(true);
      const payload = {
        name: modelForm.name.trim(),
        category: modelForm.category,
        dimensionsCm: {
          width: Number(modelForm.widthCm) || 100,
          height: Number(modelForm.heightCm) || 100,
          depth: Number(modelForm.depthCm) || 100,
        },
        scaleMode: modelForm.scaleMode,
        scaleConstraints: {
          allowX: modelForm.allowX,
          allowY: modelForm.allowY,
          allowZ: modelForm.allowZ,
          minCm: {
            width: Number(modelForm.minWidthCm) || 50,
            height: Number(modelForm.minHeightCm) || 30,
            depth: Number(modelForm.minDepthCm) || 40,
          },
          maxCm: {
            width: Number(modelForm.maxWidthCm) || 500,
            height: Number(modelForm.maxHeightCm) || 300,
            depth: Number(modelForm.maxDepthCm) || 300,
          },
        },
        glbUrl: modelForm.glbUrl.trim() || undefined,
        previewUrl: modelForm.previewUrl.trim() || undefined,
        isActive: modelForm.isActive,
        isPremium: modelForm.isPremium,
      };

      if (editingModelId) {
        await updateModelOnServer(editingModelId, payload);
        notifyOk('Моделът е обновен.');
      } else {
        await createModelOnServer(payload);
        notifyOk('Моделът е добавен в каталога.');
      }
      resetModelForm();
      await loadAdminData();
      onModelsUpdated();
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  // --- Текстури ---
  const resetTextureForm = () => {
    setEditingTextureId(null);
    setTextureForm(EMPTY_TEXTURE_FORM);
  };

  const startEditTexture = (t: CatalogTexture) => {
    setEditingTextureId(t.id);
    setTextureForm({
      name: t.name,
      category: t.category === 'tiles' || t.category === 'wall' ? t.category : 'floor',
      mapUrl: t.mapUrl,
      tileWidthCm: Math.round((t.tileWidthM || 0.6) * 100),
      tileHeightCm: Math.round((t.tileHeightM || 0.6) * 100),
      roughness: t.roughness ?? 0.55,
      metalness: t.metalness ?? 0.05,
      isActive: t.isActive !== false,
      isPremium: Boolean(t.isPremium),
    });
  };

  const handleSaveTexture = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsBusy(true);
      const payload = {
        name: textureForm.name.trim(),
        category: textureForm.category,
        mapUrl: textureForm.mapUrl.trim(),
        tileWidthM: Math.max(0.05, (Number(textureForm.tileWidthCm) || 60) / 100),
        tileHeightM: Math.max(0.05, (Number(textureForm.tileHeightCm) || 60) / 100),
        roughness: Number(textureForm.roughness) || 0.5,
        metalness: Number(textureForm.metalness) || 0.05,
        isActive: textureForm.isActive,
        isPremium: textureForm.isPremium,
      };

      if (editingTextureId) {
        await updateTextureOnServer(editingTextureId, payload);
        notifyOk('Текстурата е обновена.');
      } else {
        await createTextureOnServer(payload);
        notifyOk('Текстурата е добавена.');
      }
      resetTextureForm();
      await loadAdminData();
      onModelsUpdated();
    } catch (err) {
      notifyErr(err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#0b1120',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '14px' }}>⚙ Административен панел</strong>

            {permissions.canManageUsersAndSettings && (
              <button
                type="button"
                className={`btn ${activeTab === 'users' ? 'btn-active' : ''}`}
                style={{ fontSize: '11.5px' }}
                onClick={() => setActiveTab('users')}
              >
                👥 Потребители ({users.length})
              </button>
            )}

            {permissions.canManageTeam && (
              <button
                type="button"
                className={`btn ${activeTab === 'teams' ? 'btn-active' : ''}`}
                style={{ fontSize: '11.5px' }}
                onClick={() => setActiveTab('teams')}
              >
                🏢 Екипи / Агенции ({teams.length})
              </button>
            )}

            {permissions.canManageSystemSettings && (
              <button
                type="button"
                className={`btn ${activeTab === 'settings' ? 'btn-active' : ''}`}
                style={{ fontSize: '11.5px' }}
                onClick={() => setActiveTab('settings')}
              >
                🛡 Планове и одобрения
              </button>
            )}

            {permissions.canEditCatalog && (
              <>
                <button
                  type="button"
                  className={`btn ${activeTab === 'models' ? 'btn-active' : ''}`}
                  style={{ fontSize: '11.5px' }}
                  onClick={() => setActiveTab('models')}
                >
                  🛋 3D Модели ({models.length})
                </button>
                <button
                  type="button"
                  className={`btn ${activeTab === 'textures' ? 'btn-active' : ''}`}
                  style={{ fontSize: '11.5px' }}
                  onClick={() => setActiveTab('textures')}
                >
                  🎨 Текстури ({textures.length})
                </button>
              </>
            )}
          </div>

          <button type="button" className="btn btn-danger" onClick={onClose}>
            ✕ Затвори
          </button>
        </div>

        {/* СЪОБЩЕНИЯ */}
        {(statusMessage || errorMessage || isBusy) && (
          <div style={{ padding: '8px 16px', backgroundColor: '#0b1120', borderBottom: '1px solid #1e293b' }}>
            {isBusy && (
              <span style={{ fontSize: '11.5px', color: '#38bdf8', marginRight: '12px' }}>
                ⏳ Синхронизация със сървъра...
              </span>
            )}
            {statusMessage && (
              <span style={{ fontSize: '12px', color: '#34d399' }}>✅ {statusMessage}</span>
            )}
            {errorMessage && (
              <span style={{ fontSize: '12px', color: '#fb7185' }}>⚠ {errorMessage}</span>
            )}
          </div>
        )}

        {/* BODY */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ТАБ 1: ПОТРЕБИТЕЛИ, ОДОБРЕНИЯ, РОЛИ И AI КРЕДИТИ */}
          {activeTab === 'users' && permissions.canManageUsersAndSettings && (
            <>
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Чакащи одобрение</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#fbbf24' }}>{stats.pendingUsers}</div>
                  </div>
                  <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Активни потребители</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399' }}>{stats.activeUsers}</div>
                  </div>
                  <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>AI кредити в системата</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>{stats.totalAiCreditsInCirculation}</div>
                  </div>
                  <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Проекти / Хостинг</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>
                      {stats.totalScenes} пр. • {stats.storageUsedMb} MB
                    </div>
                  </div>
                </div>
              )}

              {/* Създаване на нов потребител */}
              <form
                onSubmit={(e) => void handleCreateUser(e)}
                style={{
                  backgroundColor: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '8px',
                  alignItems: 'end',
                }}
              >
                <div className="axis-field">
                  <span>Име</span>
                  <input
                    type="text"
                    required
                    className="input-control"
                    placeholder="Име и фамилия"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                </div>
                <div className="axis-field">
                  <span>Имейл</span>
                  <input
                    type="email"
                    required
                    className="input-control"
                    placeholder="user@domain.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="axis-field">
                  <span>Парола</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="input-control"
                    placeholder="мин. 6 символа"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>
                <div className="axis-field">
                  <span>Роля</span>
                  <select
                    className="input-control"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  >
                    <option value="user">Потребител</option>
                    <option value="editor">Редактор (каталог)</option>
                    {permissions.canManageSystemSettings && <option value="admin">Admin</option>}
                  </select>
                </div>
                <div className="axis-field">
                  <span>План</span>
                  <select
                    className="input-control"
                    value={newUserPlan}
                    onChange={(e) => setNewUserPlan(e.target.value as PlanLevel)}
                  >
                    {PLAN_KEYS.map((pk) => (
                      <option key={pk} value={pk}>
                        {systemSettings?.planConfigs?.[pk]?.label ?? pk}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="axis-field">
                  <span>Начални AI кредити</span>
                  <input
                    type="number"
                    min={0}
                    className="input-control"
                    value={newUserCredits}
                    onChange={(e) => setNewUserCredits(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <button type="submit" className="btn btn-active" style={{ padding: '7px 10px' }}>
                  + Създай профил
                </button>
              </form>

              {/* Таблица потребители */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users.map((u) => {
                  const deltaVal = creditDeltasByUser[u.id] ?? 0;
                  return (
                    <div
                      key={u.id}
                      style={{
                        backgroundColor: '#1e293b',
                        border: u.status === 'pending_approval' ? '1px solid #f59e0b' : '1px solid #334155',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>
                          {u.name}{' '}
                          <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '11px' }}>
                            ({u.email})
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                          Статус: <b>{STATUS_LABELS[u.status]}</b> • Роля: <b>{ROLE_LABELS[u.role]}</b> • Лични кредити:{' '}
                          <b style={{ color: '#fbbf24' }}>{u.aiCreditsBalance}</b>
                          {u.team ? ` • Екип: ${u.team.name} (общо налични: ${u.totalAvailableCredits})` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {u.status !== 'active' && (
                          <button
                            type="button"
                            className="btn btn-active"
                            style={{ fontSize: '11px' }}
                            onClick={() => void handleQuickUserPatch(u.id, { status: 'active' })}
                          >
                            ✓ Одобри / Активирай
                          </button>
                        )}
                        {u.status === 'active' && u.role !== 'super_admin' && (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: '11px' }}
                            onClick={() => void handleQuickUserPatch(u.id, { status: 'suspended' })}
                          >
                            Спри
                          </button>
                        )}

                        <select
                          className="input-control"
                          style={{ width: 'auto', fontSize: '11px', padding: '4px 6px' }}
                          value={u.role}
                          disabled={u.role === 'super_admin' && !permissions.canManageSystemSettings}
                          onChange={(e) =>
                            void handleQuickUserPatch(u.id, { role: e.target.value as UserRole })
                          }
                        >
                          <option value="user">Потребител</option>
                          <option value="editor">Редактор</option>
                          {permissions.canManageSystemSettings && <option value="admin">Admin</option>}
                          {permissions.canManageSystemSettings && (
                            <option value="super_admin">Super Admin</option>
                          )}
                        </select>

                        <select
                          className="input-control"
                          style={{ width: 'auto', fontSize: '11px', padding: '4px 6px' }}
                          value={u.planLevel}
                          onChange={(e) =>
                            void handleQuickUserPatch(u.id, { planLevel: e.target.value as PlanLevel })
                          }
                        >
                          {PLAN_KEYS.map((pk) => (
                            <option key={pk} value={pk}>
                              {systemSettings?.planConfigs?.[pk]?.label ?? pk}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          className="input-control"
                          style={{ width: '74px', fontSize: '11px', padding: '4px 6px' }}
                          placeholder="+/- кр."
                          value={deltaVal || ''}
                          onChange={(e) =>
                            setCreditDeltasByUser((prev) => ({
                              ...prev,
                              [u.id]: parseInt(e.target.value, 10) || 0,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => void handleApplyCredits(u.id)}
                        >
                          ⚡ Кредити
                        </button>

                        {permissions.canManageSystemSettings && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            onClick={async () => {
                              if (!window.confirm(`Изтриване на потребител ${u.email}?`)) return;
                              await deleteAdminUser(u.id);
                              await loadAdminData();
                              notifyOk('Потребителят е изтрит.');
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {recentLogs.length > 0 && (
                <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px' }}>
                  <div className="section-label">Последни системни събития (Audit Log)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                    {recentLogs.map((lg) => (
                      <div key={lg.id} style={{ fontSize: '11px', color: '#94a3b8' }}>
                        <span style={{ color: '#64748b' }}>[{lg.created_at}]</span>{' '}
                        <b style={{ color: '#e2e8f0' }}>{lg.actor_name || 'Система'}</b> →{' '}
                        <span style={{ color: '#38bdf8' }}>{lg.event_type}</span>{' '}
                        {lg.details ? `(${lg.details})` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ТАБ 2: ЕКИПИ / АГЕНЦИИ */}
          {activeTab === 'teams' && permissions.canManageTeam && (
            <>
              {(permissions.canManageUsersAndSettings ||
                systemSettings?.planConfigs?.[currentUser?.planLevel ?? 'free']?.allowTeams) && (
                <form
                  onSubmit={(e) => void handleCreateTeam(e)}
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '12px',
                    borderRadius: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '8px',
                    alignItems: 'end',
                  }}
                >
                  <div className="axis-field">
                    <span>Име на екип / агенция</span>
                    <input
                      type="text"
                      required
                      className="input-control"
                      placeholder="напр. Агенция Имоти Пловдив"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                    />
                  </div>
                  {permissions.canManageUsersAndSettings && (
                    <>
                      <div className="axis-field">
                        <span>Мениджър (Owner)</span>
                        <select
                          className="input-control"
                          value={newTeamOwnerId}
                          onChange={(e) => setNewTeamOwnerId(e.target.value)}
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="axis-field">
                        <span>Общи AI кредити</span>
                        <input
                          type="number"
                          min={0}
                          className="input-control"
                          value={newTeamCredits}
                          onChange={(e) => setNewTeamCredits(parseInt(e.target.value, 10) || 0)}
                        />
                      </div>
                    </>
                  )}
                  <button type="submit" className="btn btn-active" style={{ padding: '7px 10px' }}>
                    + Създай екип
                  </button>
                </form>
              )}

              {teams.length === 0 ? (
                <div className="empty-state-box">Няма активни екипи.</div>
              ) : (
                teams.map((tm) => (
                  <div
                    key={tm.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '14px' }}>🏢 {tm.name}</strong>
                        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#fbbf24' }}>
                          Общ пул AI кредити: <b>{tm.sharedAiCredits}</b>
                        </span>
                      </div>

                      {permissions.canManageUsersAndSettings && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="number"
                            className="input-control"
                            style={{ width: '90px', fontSize: '11px' }}
                            placeholder="+/- кредити"
                            value={teamCreditDeltaById[tm.id] || ''}
                            onChange={(e) =>
                              setTeamCreditDeltaById((prev) => ({
                                ...prev,
                                [tm.id]: parseInt(e.target.value, 10) || 0,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-active"
                            style={{ fontSize: '11px' }}
                            onClick={async () => {
                              const d = teamCreditDeltaById[tm.id] ?? 0;
                              if (!d) return;
                              await addTeamCredits({ teamId: tm.id, delta: d });
                              setTeamCreditDeltaById((prev) => ({ ...prev, [tm.id]: 0 }));
                              await loadAdminData();
                              notifyOk('Кредитите на екипа са обновени.');
                            }}
                          >
                            ⚡ Зареди пул
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Добавяне / задаване на лимит на член */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="email"
                        className="input-control"
                        style={{ flex: 1, minWidth: '180px', fontSize: '12px' }}
                        placeholder="Имейл на регистриран служител/член"
                        value={memberEmailByTeam[tm.id] ?? ''}
                        onChange={(e) =>
                          setMemberEmailByTeam((prev) => ({ ...prev, [tm.id]: e.target.value }))
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        className="input-control"
                        style={{ width: '130px', fontSize: '12px' }}
                        placeholder="Лимит AI кредити"
                        value={memberLimitByTeam[tm.id] ?? 50}
                        onChange={(e) =>
                          setMemberLimitByTeam((prev) => ({
                            ...prev,
                            [tm.id]: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: '12px' }}
                        onClick={async () => {
                          try {
                            await manageTeamMember({
                              teamId: tm.id,
                              email: memberEmailByTeam[tm.id] ?? '',
                              subAction: 'upsert',
                              creditLimit: memberLimitByTeam[tm.id] ?? 50,
                            });
                            setMemberEmailByTeam((prev) => ({ ...prev, [tm.id]: '' }));
                            await loadAdminData();
                            notifyOk('Членът на екипа и лимитът му са записани.');
                          } catch (err) {
                            notifyErr(err);
                          }
                        }}
                      >
                        + Добави / Обнови лимит
                      </button>
                    </div>

                    {/* Списък членове */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {tm.members.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            backgroundColor: '#0f172a',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                          }}
                        >
                          <span>
                            <b>{m.name}</b> ({m.email}) —{' '}
                            <span style={{ color: '#38bdf8' }}>
                              {m.teamRole === 'owner'
                                ? 'Мениджър (неограничен достъп до пула)'
                                : `Лимит: ${m.teamCreditLimit} (използвани: ${m.teamCreditsUsed})`}
                            </span>
                          </span>
                          {m.teamRole !== 'owner' && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ fontSize: '10.5px', padding: '2px 7px' }}
                              onClick={async () => {
                                await manageTeamMember({
                                  teamId: tm.id,
                                  userId: m.id,
                                  subAction: 'remove',
                                });
                                await loadAdminData();
                              }}
                            >
                              Премахни
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ТАБ 3: СИСТЕМНИ НАСТРОЙКИ И ПЛАНОВЕ */}
          {activeTab === 'settings' && permissions.canManageSystemSettings && draftSettings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label
                style={{
                  backgroundColor: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                <div>
                  <strong>Изисквай одобрение от администратор при нова регистрация</strong>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Когато е включено, новите потребители влизат като „Чака одобрение“ и не виждат системата, докато не ги одобриш.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftSettings.requireAdminApproval}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, requireAdminApproval: e.target.checked })
                  }
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
                {PLAN_KEYS.map((pk) => {
                  const cfg = draftSettings.planConfigs[pk];
                  return (
                    <div
                      key={pk}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '11.5px',
                      }}
                    >
                      <strong>{cfg.label}</strong>
                      <label className="axis-field">
                        <span>Макс. проекти</span>
                        <input
                          type="number"
                          min={0}
                          className="input-control"
                          value={cfg.maxProjects}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, maxProjects: parseInt(e.target.value, 10) || 0 },
                              },
                            })
                          }
                        />
                      </label>
                      <label className="axis-field">
                        <span>Месечни AI кредити</span>
                        <input
                          type="number"
                          min={0}
                          className="input-control"
                          value={cfg.monthlyAiCredits}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, monthlyAiCredits: parseInt(e.target.value, 10) || 0 },
                              },
                            })
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <span>Премиум каталог</span>
                        <input
                          type="checkbox"
                          checked={cfg.allowPremiumCatalog}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, allowPremiumCatalog: e.target.checked },
                              },
                            })
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <span>Генератори кухня/гардероб</span>
                        <input
                          type="checkbox"
                          checked={cfg.allowParametricGenerators}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, allowParametricGenerators: e.target.checked },
                              },
                            })
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <span>Експорт спецификация</span>
                        <input
                          type="checkbox"
                          checked={cfg.allowBomExport}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, allowBomExport: e.target.checked },
                              },
                            })
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <span>Създаване на екипи</span>
                        <input
                          type="checkbox"
                          checked={cfg.allowTeams}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              planConfigs: {
                                ...draftSettings.planConfigs,
                                [pk]: { ...cfg, allowTeams: e.target.checked },
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn-active"
                style={{ alignSelf: 'flex-start', padding: '8px 16px' }}
                onClick={async () => {
                  try {
                    setIsBusy(true);
                    const saved = await updateSystemSettings(draftSettings);
                    setDraftSettings(saved);
                    if (onSettingsUpdated) onSettingsUpdated(saved);
                    notifyOk('Системните настройки и лимитите на плановете са записани.');
                  } catch (err) {
                    notifyErr(err);
                  } finally {
                    setIsBusy(false);
                  }
                }}
              >
                💾 Запази системните настройки
              </button>
            </div>
          )}

          {/* ТАБ 4: 3D МОДЕЛИ */}
          {activeTab === 'models' && permissions.canEditCatalog && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '16px', alignItems: 'start' }}>
              <form
                onSubmit={(e) => void handleSaveModel(e)}
                style={{
                  backgroundColor: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="section-label">
                  {editingModelId ? 'Редакция на 3D модел' : 'Нов 3D модел в каталога'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="axis-field">
                    <span>Наименование</span>
                    <input
                      type="text"
                      required
                      className="input-control"
                      value={modelForm.name}
                      onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Категория</span>
                    <select
                      className="input-control"
                      value={modelForm.category}
                      onChange={(e) =>
                        setModelForm({ ...modelForm, category: e.target.value as ModelCategory })
                      }
                    >
                      {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div className="axis-field">
                    <span>Ширина (см)</span>
                    <input
                      type="number"
                      className="input-control"
                      value={modelForm.widthCm}
                      onChange={(e) => setModelForm({ ...modelForm, widthCm: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Дълбочина (см)</span>
                    <input
                      type="number"
                      className="input-control"
                      value={modelForm.depthCm}
                      onChange={(e) => setModelForm({ ...modelForm, depthCm: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Височина (см)</span>
                    <input
                      type="number"
                      className="input-control"
                      value={modelForm.heightCm}
                      onChange={(e) => setModelForm({ ...modelForm, heightCm: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="axis-field">
                  <span>.GLB файл</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="https://.../model.glb"
                      value={modelForm.glbUrl}
                      onChange={(e) => setModelForm({ ...modelForm, glbUrl: e.target.value })}
                    />
                    <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ⬆ Качи GLB
                      <input
                        type="file"
                        accept=".glb"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setIsBusy(true);
                            const up = await uploadGlbFile(f);
                            setModelForm((prev) => ({ ...prev, glbUrl: up.url }));
                            notifyOk('GLB файлът е качен.');
                          } catch (err) {
                            notifyErr(err);
                          } finally {
                            setIsBusy(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="axis-field">
                  <span>Превю снимка</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="https://.../preview.jpg"
                      value={modelForm.previewUrl}
                      onChange={(e) => setModelForm({ ...modelForm, previewUrl: e.target.value })}
                    />
                    <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ⬆ Качи снимка
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setIsBusy(true);
                            const up = await uploadPreviewImage(f);
                            setModelForm((prev) => ({ ...prev, previewUrl: up.url }));
                            notifyOk('Превюто е качено.');
                          } catch (err) {
                            notifyErr(err);
                          } finally {
                            setIsBusy(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={modelForm.isActive}
                      onChange={(e) => setModelForm({ ...modelForm, isActive: e.target.checked })}
                    />
                    <span>Активен в каталога</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fbbf24' }}>
                    <input
                      type="checkbox"
                      checked={modelForm.isPremium}
                      onChange={(e) => setModelForm({ ...modelForm, isPremium: e.target.checked })}
                    />
                    <span>★ Премиум (само за платени планове)</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-active" style={{ flex: 1 }}>
                    {editingModelId ? 'Запази промените' : '+ Добави модел'}
                  </button>
                  {editingModelId && (
                    <button type="button" className="btn" onClick={resetModelForm}>
                      Отказ
                    </button>
                  )}
                </div>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {models.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '12.5px' }}>
                        {m.name}{' '}
                        {m.isPremium && <span style={{ color: '#fbbf24', fontSize: '10px' }}>★ PRO</span>}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                        {CATEGORY_LABELS[m.category]} • {m.dimensionsCm.width}×{m.dimensionsCm.depth}×
                        {m.dimensionsCm.height} см
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: '11px', padding: '3px 7px' }}
                        onClick={() => startEditModel(m)}
                      >
                        Редакция
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: '11px', padding: '3px 7px' }}
                        onClick={async () => {
                          if (!window.confirm(`Изтриване на „${m.name}“?`)) return;
                          await deleteModelOnServer(m.id);
                          await loadAdminData();
                          onModelsUpdated();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ТАБ 5: ТЕКСТУРИ */}
          {activeTab === 'textures' && permissions.canEditCatalog && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '16px', alignItems: 'start' }}>
              <form
                onSubmit={(e) => void handleSaveTexture(e)}
                style={{
                  backgroundColor: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="section-label">
                  {editingTextureId ? 'Редакция на текстура' : 'Нова PBR текстура'}
                </div>

                <div className="axis-field">
                  <span>Наименование</span>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={textureForm.name}
                    onChange={(e) => setTextureForm({ ...textureForm, name: e.target.value })}
                  />
                </div>

                <div className="axis-field">
                  <span>Категория</span>
                  <select
                    className="input-control"
                    value={textureForm.category}
                    onChange={(e) =>
                      setTextureForm({
                        ...textureForm,
                        category: e.target.value as 'floor' | 'tiles' | 'wall',
                      })
                    }
                  >
                    <option value="floor">Паркет / Под</option>
                    <option value="tiles">Плочки / Гранитогрес</option>
                    <option value="wall">Стени / Тапети / Мазилка</option>
                  </select>
                </div>

                <div className="axis-field">
                  <span>Изображение</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      required
                      className="input-control"
                      placeholder="https://.../texture.jpg"
                      value={textureForm.mapUrl}
                      onChange={(e) => setTextureForm({ ...textureForm, mapUrl: e.target.value })}
                    />
                    <label className="btn" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ⬆ Качи
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setIsBusy(true);
                            const up = await uploadTextureImage(f);
                            setTextureForm((prev) => ({ ...prev, mapUrl: up.url }));
                            notifyOk('Текстурата е качена.');
                          } catch (err) {
                            notifyErr(err);
                          } finally {
                            setIsBusy(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="axis-field">
                    <span>Ширина на плочка/рапорт (см)</span>
                    <input
                      type="number"
                      className="input-control"
                      value={textureForm.tileWidthCm}
                      onChange={(e) =>
                        setTextureForm({ ...textureForm, tileWidthCm: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Височина на плочка/рапорт (см)</span>
                    <input
                      type="number"
                      className="input-control"
                      value={textureForm.tileHeightCm}
                      onChange={(e) =>
                        setTextureForm({ ...textureForm, tileHeightCm: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={textureForm.isActive}
                      onChange={(e) => setTextureForm({ ...textureForm, isActive: e.target.checked })}
                    />
                    <span>Активна</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fbbf24' }}>
                    <input
                      type="checkbox"
                      checked={textureForm.isPremium}
                      onChange={(e) => setTextureForm({ ...textureForm, isPremium: e.target.checked })}
                    />
                    <span>★ Премиум</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-active" style={{ flex: 1 }}>
                    {editingTextureId ? 'Запази текстурата' : '+ Добави текстура'}
                  </button>
                  {editingTextureId && (
                    <button type="button" className="btn" onClick={resetTextureForm}>
                      Отказ
                    </button>
                  )}
                </div>
              </form>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {textures.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <img
                      src={t.mapUrl}
                      alt={t.name}
                      style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '4px' }}
                    />
                    <div style={{ fontSize: '11.5px', fontWeight: 600 }}>
                      {t.name} {t.isPremium && <span style={{ color: '#fbbf24' }}>★</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, fontSize: '10.5px', padding: '3px' }}
                        onClick={() => startEditTexture(t)}
                      >
                        Редакция
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: '10.5px', padding: '3px 6px' }}
                        onClick={async () => {
                          if (!window.confirm(`Изтриване на текстура „${t.name}“?`)) return;
                          await deleteTextureOnServer(t.id);
                          await loadAdminData();
                          onModelsUpdated();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};