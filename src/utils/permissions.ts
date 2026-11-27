import type { AuthUser, PlanConfigMap, PlanLevel, UserRole } from '../types/auth';

export const DEFAULT_PLAN_LABELS: Record<PlanLevel, string> = {
  free: 'Free',
  plan_1: 'Ниво 1',
  plan_2: 'Ниво 2',
  plan_3: 'Ниво 3',
  plan_4: 'Ниво 4',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Потребител',
  editor: 'Editor',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] || role;
}

export function getPlanLabel(plan: PlanLevel, configs?: PlanConfigMap | null): string {
  return configs?.[plan]?.label || DEFAULT_PLAN_LABELS[plan] || plan;
}

export function canAccessAdminPanel(user: AuthUser | null): boolean {
  if (!user || user.status !== 'active') return false;
  return user.role === 'editor' || user.role === 'admin' || user.role === 'super_admin';
}

export function canManageUsersAndTeams(user: AuthUser | null): boolean {
  if (!user || user.status !== 'active') return false;
  return user.role === 'admin' || user.role === 'super_admin';
}

export function canManagePlansAndSettings(user: AuthUser | null): boolean {
  if (!user || user.status !== 'active') return false;
  return user.role === 'super_admin';
}

export function isPlanAllowed(
  user: AuthUser | null,
  configs: PlanConfigMap | null | undefined,
  flag:
    | 'allowPremiumCatalog'
    | 'allowParametricGenerators'
    | 'allowBomExport'
    | 'allowTeams'
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  const cfg = configs?.[user.planLevel];
  if (!cfg) return user.planLevel !== 'free';
  return Boolean(cfg[flag]);
}