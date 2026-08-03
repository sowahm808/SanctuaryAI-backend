# Data model and tenant ownership

## Rules

Every tenant-owned row stores `organizationId`, including child/version records. Repositories must obtain that value from the authenticated request context, add it to every unique lookup and mutation, and include `deletedAt: null` for models that support soft deletion. A client-provided organization identifier is never authorization. Create/update code must also verify that referenced records have the same `organizationId`; a UUID foreign key proves identity, not tenant ownership.

The only deliberate nullable tenant keys are platform-wide `Role`, `Template`, `SystemSetting`, `WebhookEvent`, and `IdempotencyRecord` rows. `null` means platform scope and access must be limited to platform administrators. Users, authentication sessions, verification/password-reset tokens, and permissions are identity/platform records. They acquire tenant access only through an active membership. Audit logs and version rows are append-only and are never soft deleted.

Applicable mutable business records expose `deletedAt`. Normal reads must exclude deleted rows; restore/administrative queries must opt in explicitly. Children that are meaningless without their parent use `onDelete: Cascade`; optional historical associations use `SetNull`; membership role changes use `Restrict`. Production code should normally soft-delete aggregates rather than invoke referential actions.

## Relationship map

```text
User --< Membership >-- Organization --< Role --< RolePermission >-- Permission
User --< AuthSession
Organization -- ChurchProfile
Organization -- BrandKit >-- MediaAsset (primary/secondary logos)
Organization --< MonthlyCampaign --< MonthlyTheme --< ThemeVersion
                         |--< SermonSeries --< Sermon --< SermonVersion
                         |--< PrayerCollection --< PrayerPoint
                         |                        `--< PrayerVersion
                         `--< PropheticDeclaration --< DeclarationVersion
Organization --< FlyerProject --< FlyerVersion
Organization --< VideoProject
Organization --< SocialPost --< SocialPostVersion
                            `--< PublishingJob >-- SocialAccount
Organization --< ApprovalRequest --< ReviewComment
Organization --< KnowledgeDocument --< KnowledgeChunk -- EmbeddingMetadata
                                  `--< IngestionJob
Organization --< AnalyticsSnapshot --< AnalyticsMetric
```

Polymorphic references (`resourceType` plus `resourceId`) deliberately have no database foreign key. The application must resolve them through a closed resource registry and enforce tenant equality. Media references embedded in validated JSON receive the same ownership validation.

## Integrity and query behavior

All IDs and scalar foreign-key identifiers are PostgreSQL UUIDs. Domain uniqueness includes normalized user email, organization slug, membership per user/organization, campaign per organization/month/year, sequence/version pairs, provider event IDs, social accounts, storage keys, and idempotency scopes. Indexes begin with tenant and commonly-used status/date fields; stable UUIDs terminate cursor-oriented indexes.

The initial migration adds database checks for months, supported years, percentages, positive durations/dimensions, sequences, version numbers, chronological calendar ranges, token counts, and bounded queue attempts. DTO validation should reject these values earlier and provide useful errors; database checks remain the final concurrency-safe defense.

## Migration and seed workflow

Run `npm run prisma:generate`, then apply committed migrations with `npm run migrate:deploy`; do not use `prisma db push`. `npm run seed` is deterministic and rerunnable. It installs the permission catalogue, nine default roles, and a sample church data graph. To create a real development login, set `DEV_SUPER_ADMIN_EMAIL` and a `DEV_SUPER_ADMIN_PASSWORD` of at least 12 characters. The seed refuses this feature when `NODE_ENV=production`; no working credential is stored in source.
