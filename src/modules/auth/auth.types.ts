export const ROLES = [
  "SuperAdministrator",
  "ChurchAdministrator",
  "SeniorPastor",
  "AssociatePastor",
  "ContentWriter",
  "MediaTeam",
  "Reviewer",
  "Publisher",
  "Viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "themes.create",
  "themes.read",
  "themes.update",
  "themes.approve",
  "sermons.create",
  "sermons.publish",
  "flyers.edit",
  "social.schedule",
  "social.publish",
  "users.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    permissions: Permission[];
  };
  role: Role | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSetupComplete: boolean;
  subscriptionActive: boolean;
}

export type AuthResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "verification_required" };
