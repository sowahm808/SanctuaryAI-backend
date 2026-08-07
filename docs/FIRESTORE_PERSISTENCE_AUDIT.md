# Firestore persistence audit

Audited 2026-08-07. The “appears in Firestore” column reflects the production collection list supplied with this audit; it is not inferred from index configuration. Firestore creates a collection on its first document write, so no empty collections or synthetic documents were created.

## Route-to-collection trace

| Feature | Expected collection | Actual collection | Read path | Write path | Currently used? |
|---|---|---|---|---|---|
| Approval / Review Center | `approvals` | `approvals` | `GET /api/approvals`, `GET /api/approvals/:id`, and resource approval lookup | `POST /api/{prayers,declarations,flyers}/:id/submit-review`; Theme review submission also writes here | Yes; canonicalized |
| Review comments | `reviewComments` | `reviewComments` for approval comments; non-approval comments remain embedded in their resource | `GET /api/approvals/:id` | `POST /api/approvals/:id/comments` | Yes, naturally created on first approval comment |
| Generic workflow timeline | `workflowEvents` | `workflowEvents` | `GET /api/{prayers,declarations,flyers,...}/:id/timeline` and approval detail | Every generic workflow create/save/generate/comment/review mutation | Yes, naturally created on first generic workflow mutation |
| Theme timeline | `themeEvents` | `themeEvents` | `GET /api/themes/:id/timeline` | Theme mutations | Yes; intentionally theme-specific, not a reader/writer mismatch |
| Security/operational audit | `auditEvents` | `auditEvents` | Audit/export features | Generic workflow and campaign/job mutations | Yes; not used as the UI workflow timeline |
| Media library | `mediaAssets` | `mediaAssets` | `GET /api/media` | `POST /api/media` metadata creation | Yes in code; no record appears until a real upload/metadata create succeeds |
| Flyer Studio | `flyerProjects` or `flyers` | `flyerProjects` | `GET /api/flyers` maps through the workflow configuration | `POST/PATCH/PUT /api/flyers...` maps through the same configuration | Yes; `flyerProjects` is canonical |
| Video Studio | `videoProjects` | `videoProjects` | `GET /api/videos` | `POST/PATCH/PUT /api/videos...` | Yes in code |
| Notifications | `notifications` | `notifications` | `GET /api/notifications` | Generic notification mutations; submitting review now writes a reviewer notification when a reviewer is assigned | Yes in code |
| Brand Kit | `brandKits` | `brandKits/{organizationId}` | `GET /api/organizations/current/brand-kit` | Organization Brand Kit update | Yes in code; separate tenant-keyed document is the domain design |
| Dashboard summary cache | `dashboardSummaries` | `dashboardSummaries/{organizationId}` | Dashboard summary repository | Explicit dashboard rebuild/save only | Optional cache; `NOT_FOUND` is accepted and no seed is required |
| Social accounts | `socialPosts` | `socialAccounts` | `GET /api/social` | Social account workflow mutations | Yes, but this feature is account configuration—not a SocialPost model |
| Publishing content | `socialPosts` | `publishingItems` | `GET /api/publishing` | Publishing workflow mutations | Yes under the current generic publishing-item model |
| Publishing execution | `publishingJobs` | `asyncJobs` with publishing job types | Job endpoints | Publishing export/schedule job creation | Yes under the shared durable job model |

The backend Firestore adapter exposes `getDocument`, `findDocument`, `queryDocuments`, `queryDocumentsPage`, `putDocument`, and `deleteDocument`. No application use of the Admin SDK `collection()`, `collectionGroup()`, or a separate `queryDocuments()` implementation was found outside the adapter/repository abstraction. Index declarations do not prove that a collection contains documents.

## Approval trace and schema

A generic submit-review request loads the tenant-owned versioned resource, calls `ApprovalWorkflowService.submit`, writes `approvals/{id}`, updates the resource with `activeApprovalId`, and writes both `workflowEvents` and `auditEvents`. The canonical persisted document contains:

- `id`, `organizationId`, `resourceType`, `resourceId`
- compatibility aliases `contentType` and `contentId`
- `status`, `requestedByUserId`, optional `reviewerUserId`
- `versionId`, `revision`
- `submittedAt`, `createdAt`, `updatedAt`; `decidedAt` is added for terminal decisions

When a reviewer is assigned at submission, `notifications/{id}` is also persisted with the approval and resource references. Unassigned review requests intentionally do not manufacture a recipient notification.

Theme review uses the same canonical `approvals` collection, although its timeline remains in the existing theme-specific `themeEvents` model. Prayer, Declaration, Flyer, Sermon, Video, and generic Publishing workflows use `workflowEvents`. Each generic event write is paired with an operational `auditEvents` write; readers and writers are therefore connected rather than attempting to derive UI labels from audit records.

## Domain model / physical collection report

| Domain | Collection or storage model | Exists in code | Read | Write | Appears in supplied production list | Action |
|---|---|---:|---:|---:|---:|---|
| Approval | `approvals` | Yes | Yes | Yes | No | No seed; exercise submit-review. Persistence is integration-tested. |
| ReviewComment | `reviewComments` | Yes | Yes | Yes | No | No seed; first approval comment creates it. |
| Notification | `notifications` | Yes | Yes | Yes | No | No seed; assigned submit-review now creates it naturally. |
| MediaAsset | `mediaAssets` | Yes | Yes | Yes | No | No seed; first successful real metadata/upload flow creates it. |
| BrandKit | `brandKits/{organizationId}` | Yes | Yes | Yes | No | Keep separate collection; do not duplicate onto organization documents. |
| FlyerProject | `flyerProjects` | Yes | Yes | Yes | No | Canonical mapping retained; dashboard rebuild corrected to query it. |
| VideoProject | `videoProjects` | Yes | Yes | Yes | No | No seed; collection appears on first project creation. |
| SocialPost | No dedicated model; current publishing abstraction is `publishingItems` | Partial | Via publishing | Via publishing | No | Product/domain decision required before introducing `socialPosts`; do not rename blindly. |
| PublishingJob | Shared `asyncJobs` typed jobs | Yes | Yes | Yes | `asyncJobs` yes | No separate collection required by current architecture. |
| WorkflowTimelineEvent | `workflowEvents` (generic), `themeEvents` (Theme) | Yes | Yes | Yes | `workflowEvents` no; `themeEvents` yes | No seed; generic mutations create events naturally. |
| DashboardSummary | `dashboardSummaries/{organizationId}` optional cache | Yes | Yes | Explicit rebuild | No | Missing cache is acceptable; rebuild only through normal architecture. |

## Production-list interpretation

The supplied collections (`asyncJobs`, `auditEvents`, `campaigns`, `declarations`, `memberships`, `organizations`, `prayers`, `sermons`, `sessions`, `themeEvents`, `themes`, `users`) show that those paths have received at least one retained document. Absence of the other names alone does not distinguish an unused feature from a broken write. The code traces above classify each absence without creating data. The genuine mismatches fixed by this audit are the dashboard rebuild’s stale `flyers` query and the missing reviewer-notification side effect.
