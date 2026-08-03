-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PARTIALLY_PUBLISHED', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublishingJobStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'QUARANTINED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITATION', 'APPROVAL_REQUESTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'POST_PUBLISHED', 'POST_FAILED', 'TOKEN_EXPIRING', 'CONNECTION_LOST', 'RENDER_COMPLETED', 'RENDER_FAILED', 'SECURITY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'GENERATING', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CalendarItemType" AS ENUM ('SERMON', 'EVENT', 'CAMPAIGN', 'SOCIAL_POST', 'DEADLINE');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('FLYER', 'VIDEO');

-- CreateEnum
CREATE TYPE "AnalyticsPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" UUID,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activeOrganizationId" UUID,
    "refreshTokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL DEFAULT 'EMAIL_VERIFICATION',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "churchName" TEXT NOT NULL,
    "slogan" TEXT,
    "description" TEXT,
    "seniorPastorName" TEXT,
    "addressJson" JSONB,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "serviceScheduleJson" JSONB,
    "preferredBibleTranslation" TEXT,
    "ministryTone" TEXT,
    "statementOfFaith" TEXT,
    "doctrinalGuidelines" TEXT,
    "prohibitedContent" TEXT,
    "standardHashtags" JSONB,
    "defaultFooter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChurchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "primaryLogoAssetId" UUID,
    "secondaryLogoAssetId" UUID,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "backgroundColor" TEXT,
    "headingFont" TEXT,
    "bodyFont" TEXT,
    "brandGuidelines" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCampaign" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "spiritualFocus" TEXT,
    "mainScripture" TEXT,
    "supportingScripturesJson" JSONB,
    "numberOfSundays" INTEGER,
    "majorEventsJson" JSONB,
    "tone" TEXT,
    "bibleTranslation" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyTheme" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "mainScripture" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "themeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SermonSeries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SermonSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sermon" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "seriesId" UUID,
    "title" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "speakerName" TEXT,
    "contentJson" JSONB NOT NULL,
    "targetDurationMinutes" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Sermon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SermonVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sermonId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SermonVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerCollection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "sermonId" UUID,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrayerCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerPoint" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "scripture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrayerPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropheticDeclaration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scripture" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PropheticDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "declarationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "metadata" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerProject" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID,
    "title" TEXT NOT NULL,
    "canvas" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "renderStatus" "RenderStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FlyerProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "flyerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoProject" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID,
    "title" TEXT NOT NULL,
    "timeline" JSONB NOT NULL,
    "durationSeconds" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "renderStatus" "RenderStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "renderProgress" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" JSONB NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "connectedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "content" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "socialPostId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "editorId" UUID NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "socialPostId" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "PublishingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 5,
    "platformPostId" TEXT,
    "platformPostUrl" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "assignedReviewerId" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentCommentId" UUID,
    "fieldPath" TEXT,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "generationType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "promptMetadata" JSONB,
    "outputMetadata" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DECIMAL(12,6),
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "mediaAssetId" UUID,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'QUEUED',
    "metadata" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingMetadata" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "chunkId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vectorKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 5,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "queryHash" TEXT NOT NULL,
    "filters" JSONB,
    "resultChunkIds" JSONB NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureHash" TEXT,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 5,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "platform" "SocialPlatform",
    "period" "AnalyticsPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsMetric" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "dimensions" JSONB,

    CONSTRAINT "AnalyticsMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "CalendarItemType" NOT NULL,
    "resourceId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "User_status_deletedAt_id_idx" ON "User"("status", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_deletedAt_id_idx" ON "Organization"("status", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_deletedAt_id_idx" ON "Membership"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Role_organizationId_deletedAt_id_idx" ON "Role"("organizationId", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_id_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt", "id");

-- CreateIndex
CREATE INDEX "AuthSession_familyId_idx" ON "AuthSession"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_expiresAt_idx" ON "VerificationToken"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_status_expiresAt_id_idx" ON "Invitation"("organizationId", "status", "expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organizationId_normalizedEmail_status_key" ON "Invitation"("organizationId", "normalizedEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchProfile_organizationId_key" ON "ChurchProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_organizationId_key" ON "BrandKit"("organizationId");

-- CreateIndex
CREATE INDEX "MonthlyCampaign_organizationId_status_year_month_deletedAt__idx" ON "MonthlyCampaign"("organizationId", "status", "year", "month", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCampaign_organizationId_month_year_key" ON "MonthlyCampaign"("organizationId", "month", "year");

-- CreateIndex
CREATE INDEX "MonthlyTheme_organizationId_status_deletedAt_id_idx" ON "MonthlyTheme"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "MonthlyTheme_organizationId_campaignId_idx" ON "MonthlyTheme"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "ThemeVersion_organizationId_themeId_createdAt_id_idx" ON "ThemeVersion"("organizationId", "themeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeVersion_themeId_version_key" ON "ThemeVersion"("themeId", "version");

-- CreateIndex
CREATE INDEX "SermonSeries_organizationId_status_deletedAt_id_idx" ON "SermonSeries"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SermonSeries_organizationId_title_key" ON "SermonSeries"("organizationId", "title");

-- CreateIndex
CREATE INDEX "Sermon_organizationId_status_serviceDate_deletedAt_id_idx" ON "Sermon"("organizationId", "status", "serviceDate", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SermonVersion_organizationId_sermonId_createdAt_id_idx" ON "SermonVersion"("organizationId", "sermonId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SermonVersion_sermonId_version_key" ON "SermonVersion"("sermonId", "version");

-- CreateIndex
CREATE INDEX "PrayerCollection_organizationId_status_deletedAt_id_idx" ON "PrayerCollection"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "PrayerPoint_organizationId_collectionId_deletedAt_id_idx" ON "PrayerPoint"("organizationId", "collectionId", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerPoint_collectionId_sequence_key" ON "PrayerPoint"("collectionId", "sequence");

-- CreateIndex
CREATE INDEX "PrayerVersion_organizationId_collectionId_createdAt_id_idx" ON "PrayerVersion"("organizationId", "collectionId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerVersion_collectionId_version_key" ON "PrayerVersion"("collectionId", "version");

-- CreateIndex
CREATE INDEX "PropheticDeclaration_organizationId_status_deletedAt_id_idx" ON "PropheticDeclaration"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "DeclarationVersion_organizationId_declarationId_createdAt_i_idx" ON "DeclarationVersion"("organizationId", "declarationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationVersion_declarationId_version_key" ON "DeclarationVersion"("declarationId", "version");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_status_createdAt_deletedAt_id_idx" ON "MediaAsset"("organizationId", "status", "createdAt", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_organizationId_storageKey_key" ON "MediaAsset"("organizationId", "storageKey");

-- CreateIndex
CREATE INDEX "Template_organizationId_type_status_deletedAt_id_idx" ON "Template"("organizationId", "type", "status", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_name_type_key" ON "Template"("organizationId", "name", "type");

-- CreateIndex
CREATE INDEX "FlyerProject_organizationId_status_renderStatus_deletedAt_i_idx" ON "FlyerProject"("organizationId", "status", "renderStatus", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "FlyerVersion_organizationId_flyerId_createdAt_id_idx" ON "FlyerVersion"("organizationId", "flyerId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FlyerVersion_flyerId_version_key" ON "FlyerVersion"("flyerId", "version");

-- CreateIndex
CREATE INDEX "VideoProject_organizationId_status_renderStatus_deletedAt_i_idx" ON "VideoProject"("organizationId", "status", "renderStatus", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SocialAccount_organizationId_status_tokenExpiresAt_deletedA_idx" ON "SocialAccount"("organizationId", "status", "tokenExpiresAt", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_organizationId_platform_platformAccountId_key" ON "SocialAccount"("organizationId", "platform", "platformAccountId");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_status_scheduledAt_deletedAt_id_idx" ON "SocialPost"("organizationId", "status", "scheduledAt", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SocialPostVersion_organizationId_socialPostId_createdAt_id_idx" ON "SocialPostVersion"("organizationId", "socialPostId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostVersion_socialPostId_version_key" ON "SocialPostVersion"("socialPostId", "version");

-- CreateIndex
CREATE INDEX "PublishingJob_organizationId_status_scheduledAt_id_idx" ON "PublishingJob"("organizationId", "status", "scheduledAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PublishingJob_socialPostId_socialAccountId_key" ON "PublishingJob"("socialPostId", "socialAccountId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_organizationId_status_requestedAt_deletedAt_idx" ON "ApprovalRequest"("organizationId", "status", "requestedAt", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "ApprovalRequest_organizationId_resourceType_resourceId_idx" ON "ApprovalRequest"("organizationId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "ReviewComment_organizationId_approvalRequestId_createdAt_de_idx" ON "ReviewComment"("organizationId", "approvalRequestId", "createdAt", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_readAt_createdAt_id_idx" ON "Notification"("organizationId", "userId", "readAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AiGeneration_organizationId_status_createdAt_id_idx" ON "AiGeneration"("organizationId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_id_idx" ON "AuditLog"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_resourceType_resourceId_createdAt_idx" ON "AuditLog"("organizationId", "resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_organizationId_status_deletedAt_id_idx" ON "KnowledgeDocument"("organizationId", "status", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_organizationId_documentId_id_idx" ON "KnowledgeChunk"("organizationId", "documentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_sequence_key" ON "KnowledgeChunk"("documentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "EmbeddingMetadata_chunkId_key" ON "EmbeddingMetadata"("chunkId");

-- CreateIndex
CREATE INDEX "EmbeddingMetadata_organizationId_model_id_idx" ON "EmbeddingMetadata"("organizationId", "model", "id");

-- CreateIndex
CREATE INDEX "IngestionJob_organizationId_status_createdAt_id_idx" ON "IngestionJob"("organizationId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RetrievalLog_organizationId_createdAt_id_idx" ON "RetrievalLog"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WebhookEvent_organizationId_status_receivedAt_id_idx" ON "WebhookEvent"("organizationId", "status", "receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_scope_key_key" ON "IdempotencyRecord"("organizationId", "scope", "key");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_organizationId_periodStart_id_idx" ON "AnalyticsSnapshot"("organizationId", "periodStart", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_organizationId_platform_period_periodStar_key" ON "AnalyticsSnapshot"("organizationId", "platform", "period", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsMetric_organizationId_name_id_idx" ON "AnalyticsMetric"("organizationId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsMetric_snapshotId_name_key" ON "AnalyticsMetric"("snapshotId", "name");

-- CreateIndex
CREATE INDEX "CalendarItem_organizationId_startsAt_type_deletedAt_id_idx" ON "CalendarItem"("organizationId", "startsAt", "type", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SystemSetting_organizationId_key_idx" ON "SystemSetting"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_organizationId_key_key" ON "SystemSetting"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchProfile" ADD CONSTRAINT "ChurchProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_primaryLogoAssetId_fkey" FOREIGN KEY ("primaryLogoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_secondaryLogoAssetId_fkey" FOREIGN KEY ("secondaryLogoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCampaign" ADD CONSTRAINT "MonthlyCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTheme" ADD CONSTRAINT "MonthlyTheme_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MonthlyCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeVersion" ADD CONSTRAINT "ThemeVersion_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "MonthlyTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SermonSeries" ADD CONSTRAINT "SermonSeries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MonthlyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sermon" ADD CONSTRAINT "Sermon_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MonthlyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sermon" ADD CONSTRAINT "Sermon_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SermonSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SermonVersion" ADD CONSTRAINT "SermonVersion_sermonId_fkey" FOREIGN KEY ("sermonId") REFERENCES "Sermon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerCollection" ADD CONSTRAINT "PrayerCollection_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MonthlyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerPoint" ADD CONSTRAINT "PrayerPoint_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "PrayerCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerVersion" ADD CONSTRAINT "PrayerVersion_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "PrayerCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropheticDeclaration" ADD CONSTRAINT "PropheticDeclaration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MonthlyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationVersion" ADD CONSTRAINT "DeclarationVersion_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "PropheticDeclaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerVersion" ADD CONSTRAINT "FlyerVersion_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "FlyerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostVersion" ADD CONSTRAINT "SocialPostVersion_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbeddingMetadata" ADD CONSTRAINT "EmbeddingMetadata_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsMetric" ADD CONSTRAINT "AnalyticsMetric_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AnalyticsSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain invariants not expressible in the Prisma schema language.
ALTER TABLE "MonthlyCampaign" ADD CONSTRAINT "MonthlyCampaign_month_check" CHECK (month BETWEEN 1 AND 12);
ALTER TABLE "MonthlyCampaign" ADD CONSTRAINT "MonthlyCampaign_year_check" CHECK (year BETWEEN 2000 AND 2200);
ALTER TABLE "MonthlyCampaign" ADD CONSTRAINT "MonthlyCampaign_progress_check" CHECK ("progressPercent" BETWEEN 0 AND 100);
ALTER TABLE "MonthlyCampaign" ADD CONSTRAINT "MonthlyCampaign_sundays_check" CHECK ("numberOfSundays" IS NULL OR "numberOfSundays" BETWEEN 1 AND 6);
ALTER TABLE "MonthlyTheme" ADD CONSTRAINT "MonthlyTheme_version_check" CHECK ("currentVersion" >= 1);
ALTER TABLE "Sermon" ADD CONSTRAINT "Sermon_version_duration_check" CHECK ("currentVersion" >= 1 AND ("targetDurationMinutes" IS NULL OR "targetDurationMinutes" > 0));
ALTER TABLE "PrayerCollection" ADD CONSTRAINT "PrayerCollection_version_check" CHECK ("currentVersion" >= 1);
ALTER TABLE "PrayerPoint" ADD CONSTRAINT "PrayerPoint_sequence_check" CHECK (sequence >= 1);
ALTER TABLE "PropheticDeclaration" ADD CONSTRAINT "PropheticDeclaration_version_check" CHECK ("currentVersion" >= 1);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dimensions_duration_check" CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0) AND ("durationSeconds" IS NULL OR "durationSeconds" >= 0) AND "byteSize" >= 0);
ALTER TABLE "FlyerProject" ADD CONSTRAINT "FlyerProject_version_check" CHECK ("currentVersion" >= 1);
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_progress_duration_check" CHECK ("renderProgress" BETWEEN 0 AND 100 AND ("durationSeconds" IS NULL OR "durationSeconds" > 0));
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_version_check" CHECK ("currentVersion" >= 1);
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_attempts_check" CHECK ("attemptCount" >= 0 AND "maximumAttempts" BETWEEN 1 AND 20 AND "attemptCount" <= "maximumAttempts");
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_attempts_check" CHECK ("attemptCount" >= 0 AND "maximumAttempts" BETWEEN 1 AND 20 AND "attemptCount" <= "maximumAttempts");
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_attempts_check" CHECK ("attemptCount" >= 0 AND "maximumAttempts" BETWEEN 1 AND 20 AND "attemptCount" <= "maximumAttempts");
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sequence_tokens_check" CHECK (sequence >= 1 AND "tokenCount" >= 0);
ALTER TABLE "EmbeddingMetadata" ADD CONSTRAINT "EmbeddingMetadata_dimensions_check" CHECK (dimensions > 0);
ALTER TABLE "RetrievalLog" ADD CONSTRAINT "RetrievalLog_counts_duration_check" CHECK ("resultCount" >= 0 AND "durationMs" >= 0);
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");
