export type UserRole = 'user' | 'editor' | 'admin' | 'super_admin';
export type UserStatus = 'pending_approval' | 'active' | 'suspended';
export type PlanLevel = 'free' | 'plan_1' | 'plan_2' | 'plan_3' | 'plan_4';

export interface PlanConfig {
  id: PlanLevel;
  label: string;
  maxProjects: number;
  monthlyAiCredits: number;
  allowPremiumCatalog: boolean;
  allowParametricGenerators: boolean;
  allowBomExport: boolean;
  allowTeams: boolean;
}

export type PlanConfigMap = Record<PlanLevel, PlanConfig>;

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  teamRole: 'owner' | 'member';
  teamCreditLimit: number;
  teamCreditsUsed: number;
}

export interface AdminTeam {
  id: string;
  name: string;
  ownerUserId?: string;
  sharedAiCredits: number;
  maxMembers: number;
  members: TeamMember[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  planLevel: PlanLevel;
  aiCreditsBalance: number;
  totalAvailableCredits: number;
  projectsCount?: number;
  team?: {
    id: string;
    name: string;
    role: 'owner' | 'member';
    sharedAiCredits: number;
    creditLimit: number;
    creditsUsed: number;
  } | null;
}

export interface SystemSettings {
  requireAdminApproval: boolean;
  planConfigs: PlanConfigMap;
}

export interface AdminAuditLogItem {
  id: string;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  event_type: string;
  target_id?: string | null;
  details?: string | null;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  totalModels: number;
  totalTextures: number;
  totalScenes: number;
  totalTeams: number;
  totalAiCreditsInCirculation: number;
  storageUsedMb?: number;
  recentLogs?: AdminAuditLogItem[];
}