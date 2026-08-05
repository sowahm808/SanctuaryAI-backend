export enum UserStatus { Active = 'ACTIVE', Invited = 'INVITED', Suspended = 'SUSPENDED', Deleted = 'DELETED' }
export enum OrganizationStatus { Active = 'ACTIVE', Suspended = 'SUSPENDED', Archived = 'ARCHIVED' }
export enum MembershipStatus { Invited = 'INVITED', Active = 'ACTIVE', Suspended = 'SUSPENDED', Removed = 'REMOVED' }
export enum ContentStatus { Draft = 'DRAFT', InReview = 'IN_REVIEW', Approved = 'APPROVED', ChangesRequested = 'CHANGES_REQUESTED', Archived = 'ARCHIVED' }
export enum ApprovalStatus { Pending = 'PENDING', Approved = 'APPROVED', Rejected = 'REJECTED', ChangesRequested = 'CHANGES_REQUESTED', Cancelled = 'CANCELLED' }
export enum SocialPlatform { Facebook = 'FACEBOOK', Instagram = 'INSTAGRAM', TikTok = 'TIKTOK' }
export enum SocialPostStatus { Draft = 'DRAFT', Scheduled = 'SCHEDULED', Publishing = 'PUBLISHING', Published = 'PUBLISHED', Failed = 'FAILED', Cancelled = 'CANCELLED' }
export enum PublishingJobStatus { Queued = 'QUEUED', Running = 'RUNNING', Succeeded = 'SUCCEEDED', Failed = 'FAILED', Cancelled = 'CANCELLED', DeadLettered = 'DEAD_LETTERED' }
export enum AiGenerationStatus { Queued = 'QUEUED', Running = 'RUNNING', Succeeded = 'SUCCEEDED', Failed = 'FAILED', Cancelled = 'CANCELLED' }
export enum MediaAssetStatus { Uploading = 'UPLOADING', Processing = 'PROCESSING', Ready = 'READY', Quarantined = 'QUARANTINED', Failed = 'FAILED', Archived = 'ARCHIVED' }
export enum RenderStatus { Queued = 'QUEUED', Rendering = 'RENDERING', Succeeded = 'SUCCEEDED', Failed = 'FAILED', Cancelled = 'CANCELLED' }
export enum NotificationType { Invitation = 'INVITATION', ReviewRequested = 'REVIEW_REQUESTED', ApprovalDecision = 'APPROVAL_DECISION', ScheduledPublish = 'SCHEDULED_PUBLISH', PublishingResult = 'PUBLISHING_RESULT', TokenExpiring = 'TOKEN_EXPIRING', RenderingResult = 'RENDERING_RESULT' }
export enum CampaignStatus { Draft = 'DRAFT', Active = 'ACTIVE', Completed = 'COMPLETED', Archived = 'ARCHIVED' }
