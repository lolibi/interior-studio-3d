import type { AuthUser, PlanConfig, SystemSettings } from '../types/auth';

export interface EffectivePermissions {
  isAuthenticated: boolean;
  isStaff: boolean; // super_admin, admin или editor
  canAccessAdminPanel: boolean;
  canManageUsersAndSettings: boolean; // super_admin и admin
  canManageSystemSettings: boolean; // само super_admin
  canEditCatalog: boolean; // super_admin, admin, editor
  canUsePremiumCatalog: boolean;
  canUseParametricGenerators: boolean;
  canExportBom: boolean;
  canUseAiFeatures: boolean;
  canManageTeam: boolean;
  maxProjects: number;
  planLabel: string;
}

const FALLBACK_FREE_PLAN: PlanConfig = {
  label: 'Безплатен (Free)',
  maxProjects: 2,
  allowPremiumCatalog: false,
  allowParametricGenerators: false,
  allowBomExport: false,
  allowTeams: false,
  monthlyAiCredits: 0,
};

export function getEffectivePermissions(
  user: AuthUser | null,
  settings: SystemSettings | null
): EffectivePermissions {
  if (!user || user.status !== 'active') {
    return {
      isAuthenticated: false,
      isStaff: false,
      canAccessAdminPanel: false,
      canManageUsersAndSettings: false,
      canManageSystemSettings: false,
      canEditCatalog: false,
      canUsePremiumCatalog: false,
      canUseParametricGenerators: false,
      canExportBom: false,
      canUseAiFeatures: false,
      canManageTeam: false,
      maxProjects: 0,
      planLabel: 'Гост',
    };
  }

  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin';
  const isEditor = user.role === 'editor';
  const isStaff = isSuperAdmin || isAdmin || isEditor;

  const planCfg =
    settings?.planConfigs?.[user.planLevel] ?? FALLBACK_FREE_PLAN;

  if (isStaff) {
    return {
      isAuthenticated: true,
      isStaff: true,
      canAccessAdminPanel: true,
      canManageUsersAndSettings: isSuperAdmin || isAdmin,
      canManageSystemSettings: isSuperAdmin,
      canEditCatalog: true,
      canUsePremiumCatalog: true,
      canUseParametricGenerators: true,
      canExportBom: true,
      canUseAiFeatures: user.totalAvailableCredits > 0 || isSuperAdmin,
      canManageTeam: isSuperAdmin || isAdmin || user.teamRole === 'owner',
      maxProjects: 999999,
      planLabel: isSuperAdmin
        ? 'Super Admin'
        : isAdmin
          ? 'Admin'
          : 'Редактор',
    };
  }

  return {
    isAuthenticated: true,
    isStaff: false,
    canAccessAdminPanel: user.teamRole === 'owner', // Мениджър на екип може да отваря таба за своя екип
    canManageUsersAndSettings: false,
    canManageSystemSettings: false,
    canEditCatalog: false,
    canUsePremiumCatalog: Boolean(planCfg.allowPremiumCatalog),
    canUseParametricGenerators: Boolean(planCfg.allowParametricGenerators),
    canExportBom: Boolean(planCfg.allowBomExport),
    canUseAiFeatures: user.planLevel !== 'free' && user.totalAvailableCredits > 0,
    canManageTeam: Boolean(planCfg.allowTeams) || user.teamRole === 'owner',
    maxProjects: Math.max(1, Number(planCfg.maxProjects) || 2),
    planLabel: planCfg.label,
  };
}