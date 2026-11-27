export type UserRole = 'super_admin' | 'admin' | 'editor' | 'user';
export type UserStatus = 'pending_approval' | 'active' | 'suspended';
export type PlanLevel = 'free' | 'plan_1' | 'plan_2' | 'plan_3' | 'plan_4';

export interface PlanConfig {
  label: string;
  maxProjects: number;
  allowPremiumCatalog: boolean;
  allowParametricGenerators: boolean;
  allowBomExport: boolean;
  allowTeams: boolean;
  monthlyAiCredits: number;
}

export type PlanConfigMap = Record<PlanLevel, PlanConfig>;

export interface SystemSettings {
  requireAdminApproval: boolean;
  planConfigs: PlanConfigMap;
}

export interface UserTeamSummary {
  id: string;
  name: string;
  ownerUserId: string;
  sharedAiCredits: number;
  maxMembers: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  role: UserRole;
  planLevel: PlanLevel;
  aiCreditsBalance: number;
  teamAvailableCredits: number;
  totalAvailableCredits: number;
  teamId: string | null;
  teamRole: 'owner' | 'member' | null;
  teamCreditLimit: number;
  teamCreditsUsed: number;
  team: UserTeamSummary | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TeamDetails extends UserTeamSummary {
  members: AuthUser[];
  createdAt: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  pendingUsers: number;
  activeUsers: number;
  totalScenes: number;
  totalModels: number;
  totalTextures: number;
  totalTeams: number;
  totalAiCreditsInCirculation: number;
  storageUsedMb: number;
}

export interface AuditLogEntry {
  id: number;
  actor_user_id: string | null;
  actor_name: string | null;
  event_type: string;
  target_id: string | null;
  details: string | null;
  created_at: string;
}