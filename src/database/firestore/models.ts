import { AiGenerationStatus, ApprovalStatus, CampaignStatus, ContentStatus, MediaAssetStatus, MembershipStatus, NotificationType, OrganizationStatus, PublishingJobStatus, RenderStatus, SocialPlatform, SocialPostStatus, UserStatus } from './enums';

export type UUID = string;
export type Timestamp = Date;

export interface BaseDocument { id: UUID; createdAt: Timestamp; updatedAt: Timestamp; deletedAt?: Timestamp | null; }
export interface TenantDocument extends BaseDocument { organizationId: UUID; }
export interface VersionDocument<TSnapshot = Record<string, unknown>> extends TenantDocument { resourceId: UUID; version: number; editorUserId: UUID; changeSummary: string; snapshot: TSnapshot; diff?: Record<string, unknown>; approvalStatus: ApprovalStatus; }

export interface User extends BaseDocument { firebaseUid: string; email: string; displayName: string; status: UserStatus; defaultOrganizationId?: UUID; }
export interface Organization extends BaseDocument { name: string; slug: string; status: OrganizationStatus; }
export interface Permission extends BaseDocument { key: string; description: string; }
export interface Role extends TenantDocument { name: string; systemKey?: string; permissionIds: UUID[]; }
export interface Membership extends TenantDocument { userId: UUID; roleIds: UUID[]; status: MembershipStatus; invitedByUserId?: UUID; }
export interface AuthSession extends BaseDocument { userId: UUID; organizationId?: UUID; tokenDigest: string; expiresAt: Timestamp; revokedAt?: Timestamp | null; }
export interface VerificationToken extends BaseDocument { userId: UUID; tokenDigest: string; expiresAt: Timestamp; usedAt?: Timestamp | null; }
export type PasswordResetToken = VerificationToken;
export interface Invitation extends TenantDocument { email: string; roleIds: UUID[]; tokenDigest: string; expiresAt: Timestamp; acceptedAt?: Timestamp | null; }

export interface ChurchProfile extends TenantDocument { mission: string; denomination?: string; timezone: string; primaryLanguage: string; }
export interface BrandKit extends TenantDocument { logoAssetId?: UUID; colorPalette: string[]; fontFamilies: string[]; }
export interface MediaAsset extends TenantDocument { ownerUserId: UUID; status: MediaAssetStatus; storageKey: string; mimeType: string; byteSize: number; checksum: string; }

export interface MonthlyCampaign extends TenantDocument { name: string; month: number; year: number; status: CampaignStatus; startsAt: Timestamp; endsAt: Timestamp; }
export interface MonthlyTheme extends TenantDocument { campaignId: UUID; title: string; status: ContentStatus; sequence: number; }
export interface SermonSeries extends TenantDocument { campaignId: UUID; title: string; status: ContentStatus; }
export interface Sermon extends TenantDocument { campaignId: UUID; seriesId?: UUID; title: string; preachedAt?: Timestamp; status: ContentStatus; }
export interface SermonVersion extends VersionDocument<Sermon> { sermonId: UUID; }

export interface PrayerCollection extends TenantDocument { campaignId?: UUID; sermonId?: UUID; title: string; status: ContentStatus; }
export interface PrayerPoint extends TenantDocument { collectionId: UUID; sequence: number; text: string; }
export interface PropheticDeclaration extends TenantDocument { campaignId?: UUID; sermonId?: UUID; text: string; status: ContentStatus; }

export interface FlyerTemplate extends TenantDocument { name: string; assetIds: UUID[]; status: ContentStatus; }
export interface FlyerProject extends TenantDocument { campaignId?: UUID; templateId?: UUID; title: string; status: ContentStatus; renderStatus?: RenderStatus; assetIds: UUID[]; }
export interface VideoProject extends TenantDocument { campaignId?: UUID; title: string; status: ContentStatus; renderStatus?: RenderStatus; assetIds: UUID[]; durationSeconds?: number; }

export interface SocialAccount extends TenantDocument { platform: SocialPlatform; providerAccountId: string; displayName: string; tokenSecretRef: string; status: ContentStatus; }
export interface SocialPost extends TenantDocument { campaignId?: UUID; platform: SocialPlatform; accountIds: UUID[]; caption: string; status: SocialPostStatus; scheduledAt?: Timestamp; mediaAssetIds: UUID[]; }
export interface PublishingJob extends TenantDocument { socialPostId: UUID; socialAccountId: UUID; status: PublishingJobStatus; attempts: number; scheduledAt?: Timestamp; providerPostId?: string; }

export interface Approval extends TenantDocument { resourceType: string; resourceId: UUID; status: ApprovalStatus; requestedByUserId: UUID; reviewerUserId?: UUID; decidedAt?: Timestamp; }
export interface ReviewComment extends TenantDocument { approvalId: UUID; authorUserId: UUID; body: string; fieldPath?: string; parentCommentId?: UUID; resolvedAt?: Timestamp | null; }
export interface Notification extends TenantDocument { userId: UUID; type: NotificationType; title: string; body: string; readAt?: Timestamp | null; }
export interface AiGeneration extends TenantDocument { resourceType: string; resourceId?: UUID; status: AiGenerationStatus; provider: string; model: string; promptHash: string; costMicros?: number; }
export interface AuditLog extends TenantDocument { actorUserId?: UUID; action: string; resourceType: string; resourceId?: UUID; correlationId: string; before?: Record<string, unknown>; after?: Record<string, unknown>; }

export interface KnowledgeBaseDocument extends TenantDocument { title: string; sourceType: string; status: ContentStatus; }
export interface KnowledgeBaseChunk extends TenantDocument { documentId: UUID; sequence: number; text: string; tokenCount: number; }
export interface EmbeddingMetadata extends TenantDocument { chunkId: UUID; provider: string; model: string; dimensions: number; vectorRef: string; }
export interface IngestionJob extends TenantDocument { documentId: UUID; status: PublishingJobStatus; attempts: number; }
export interface RetrievalLog extends TenantDocument { actorUserId?: UUID; queryHash: string; returnedChunkIds: UUID[]; }

export interface WebhookEvent extends BaseDocument { provider: string; providerEventId: string; receivedAt: Timestamp; processedAt?: Timestamp | null; }
export interface IdempotencyRecord extends TenantDocument { key: string; requestHash: string; responseHash?: string; expiresAt: Timestamp; }
export interface AnalyticsSnapshot extends TenantDocument { metricKey: string; periodStart: Timestamp; periodEnd: Timestamp; value: number; dimensions: Record<string, string>; }
export interface CalendarItem extends TenantDocument { title: string; startsAt: Timestamp; endsAt: Timestamp; timezone: string; resourceType?: string; resourceId?: UUID; }
export interface SystemSetting extends BaseDocument { key: string; value: unknown; updatedByUserId?: UUID; }

export type ThemeVersion = VersionDocument<MonthlyTheme>;
export type PrayerVersion = VersionDocument<PrayerCollection>;
export type DeclarationVersion = VersionDocument<PropheticDeclaration>;
export type FlyerVersion = VersionDocument<FlyerProject>;
export type SocialPostVersion = VersionDocument<SocialPost>;
