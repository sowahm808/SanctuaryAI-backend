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
  "organizations.read",
  "organizations.write",
  "memberships.manage",
  "roles.manage",
  "churchProfile.write",
  "brandKit.write",
  "themes.write",
  "sermons.write",
  "prayers.write",
  "declarations.write",
  "media.write",
  "approvals.review",
  "themes.create",
  "themes.read",
  "themes.update",
  "themes.approve",
  "campaigns.create",
  "campaigns.read",
  "campaigns.update",
  "campaigns.generate",
  "campaigns.approve",
  "campaigns.unlock",
  "sermons.create",
  "sermons.read",
  "sermons.update",
  "sermons.approve",
  "sermons.publish",
  "prayers.create",
  "prayers.read",
  "prayers.update",
  "prayers.approve",
  "declarations.create",
  "declarations.read",
  "declarations.update",
  "declarations.approve",
  "flyers.edit",
  "flyers.create",
  "flyers.read",
  "flyers.update",
  "flyers.approve",
  "videos.create",
  "videos.read",
  "videos.update",
  "videos.approve",
  "media.upload",
  "media.read",
  "media.update",
  "social.schedule",
  "social.manage",
  "social.read",
  "social.approve",
  "social.publish",
  "publishing.create",
  "calendar.read",
  "calendar.update",
  "reviews.create",
  "reviews.read",
  "reviews.update",
  "reviews.approve",
  "notifications.manage",
  "notifications.read",
  "team.manage",
  "team.read",
  "subscription.manage",
  "subscription.read",
  "audit.export",
  "audit.read",
  "analytics.export",
  "analytics.read",
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
