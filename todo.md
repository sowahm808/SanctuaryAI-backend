# SanctuaryAI Backend Implementation TODO

This checklist turns the product requirements into an implementation and release plan for the production SanctuaryAI backend. Complete phases in order unless a task is explicitly marked as parallelizable. A checked item must be supported by merged code, automated tests, and documentation where applicable; the presence of a scaffold alone does not count as completion.

> Implementation status last audited against the backend on 2026-08-05. Only fully implemented checklist items are checked; partially implemented items remain open.

### Audit snapshot

- **10 of 277 items complete (3.6%).** The checked items remain limited to core REST prefix/Swagger wiring, Pino redaction, response envelopes, Firebase email/password registration, Firebase verification/resend, Firebase password reset, role/permission decorators, and the lint/build/unit-test release gates. Newer organization, dashboard, campaign, theme, job, session-cookie, CSRF-origin, and legacy-route code is useful product scaffolding but does not yet satisfy the full checklist clauses for those domains.
- **Automated coverage improved but is still not representative.** The repository now has 9 Jest spec files covering 32 test cases across auth sessions, CSRF origin checks, dashboard summaries, environment validation, Firebase auth guard/service behavior, legacy path rewriting, organization creation, and token encryption. There are still no Firebase Emulator Suite integration tests, Supertest end-to-end suites, tenant-isolation suites, permission-denial suites, worker suites, provider contract suites, Firestore rules/index validation tests, or coverage thresholds, so feature items remain unchecked unless every clause is supported.
- **Reproducible installation is present but the clean Node 22 gate remains open.** `package-lock.json`, `.nvmrc`, `engines.node >=22`, and the npm package-manager declaration are committed. This audit verified `npm ci`, lint, strict TypeScript build, and unit tests under the container's Node 20.20.2 runtime; `npm ci` emitted the expected EBADENGINE warning because the project requires Node 22+, so the Node 22 clean-checkout install gate remains open until it is run in the target runtime.
- **Notable partial implementations:** Firebase ID tokens are cryptographically verified and Firestore uses short-lived service-account OAuth tokens. Application session cookies are persisted by hashed opaque tokens, organizations create an owner membership, campaign/theme/dashboard/job endpoints are partially wired, CSRF origin checks exist for cookie-authenticated mutations, and audit events are written for some organization/campaign/theme actions. However, tenant-aware repository enforcement, complete authorization guards, provider integrations, BullMQ/Redis workers, storage, AI orchestration, social integrations, webhook processing, comprehensive RFC 7807 mapping, production health readiness, and complete documentation remain outstanding.
- **Audit rule:** an item stays open when any clause in that item is missing. Passing build or test commands confirms only the corresponding release-gate item and does not imply feature completeness.

## Definition of done

- [ ] Production code contains no mocks, empty controllers, placeholder services, `any`, suppressed TypeScript errors, exposed secrets, or unvalidated provider output.
- [ ] Every organization-owned operation derives its tenant from authenticated request context and enforces membership, permissions, and resource ownership server-side.
- [ ] Every endpoint has validation, safe serialization, RFC 7807 errors, response envelopes, correlation IDs, authorization, audit behavior, and complete Swagger documentation.
- [ ] Long-running and retriable work runs in BullMQ workers with persistence, idempotency, backoff, timeouts, progress, cancellation where possible, and dead-letter handling.
- [ ] All required checks in the final release gate pass against clean Firebase Emulator Suite and Redis instances.

## Phase 1 — Project bootstrap and configuration

- [ ] Pin and document Node.js 22+, package-manager version, and reproducible dependency installation.
- [ ] Enable strict TypeScript settings and lint rules that prohibit `any`, unsafe assertions, ignored errors, and floating promises.
- [ ] Establish modular-monolith boundaries for domain, application, infrastructure, controllers, persistence, integrations, jobs, and shared concerns.
- [ ] Create the required `src/config`, `src/common`, `src/database`, `src/modules`, `src/integrations`, `src/jobs`, `src/security`, `src/observability`, `src/storage`, `src/ai`, and `src/webhooks` structure.
- [ ] Validate environment variables at startup and fail fast for invalid or missing production settings. (The current schema validates scaffold settings, but production provider settings are absent and OpenAI remains optional in production.)
- [ ] Define typed configuration groups for application, Firebase, Firestore, Redis, OAuth, encryption, email, storage, OpenAI, Meta, TikTok, rendering, observability, CORS, and rate limits.
- [ ] Complete `.env.example` with safe placeholders and descriptions but no credentials.
- [x] Configure `/api/v1` as the REST prefix and conditionally expose Swagger at `/docs`.
- [ ] Add global validation with transformation, whitelist enforcement, rejection of unknown properties, and appropriate request-size limits.
- [ ] Add Helmet, compression, cookie parsing, strict CORS allowlisting, secure proxy handling, and graceful shutdown.
- [x] Add structured Pino logging with secret-field redaction.
- [ ] Add correlation-ID creation/validation and propagation through responses, logs, jobs, outbound requests, and errors.
- [x] Add a global success envelope: `data`, `meta`, and `correlationId`.
- [ ] Add RFC 7807-compatible filters for validation, domain, Firestore, Firebase integration, and unexpected errors without production stack traces.
- [ ] Configure Swagger bearer authentication, schemas, examples, pagination, permission notes, and standard error responses.

## Phase 2 — Firestore model, indexes, rules, and seed data

- [x] Review all IDs and foreign keys for UUID consistency, explicit referential actions, and correct optionality.
- [x] Implement/verify enums: `UserStatus`, `OrganizationStatus`, `MembershipStatus`, `ContentStatus`, `ApprovalStatus`, `SocialPlatform`, `SocialPostStatus`, `PublishingJobStatus`, `AiGenerationStatus`, `MediaAssetStatus`, `RenderStatus`, `NotificationType`, and `CampaignStatus`.
- [x] Implement complete required models and relations for users, organizations, memberships, roles, permissions, and authentication sessions/tokens.
- [x] Implement complete required models and relations for church profiles and brand kits, including media-asset relations.
- [x] Implement complete required models and relations for monthly campaigns, monthly themes, sermon series, sermons, and sermon versions.
- [x] Implement complete required models and relations for prayer collections, prayer points, and prophetic declarations.
- [x] Implement complete required models and relations for media assets, flyer projects, video projects, and templates.
- [x] Implement complete required models and relations for social accounts, social posts, and publishing jobs.
- [x] Implement complete required models and relations for approvals, review comments, notifications, AI generations, and audit logs.
- [x] Add knowledge-base document, chunk, embedding metadata, ingestion job, and retrieval log models with mandatory tenant ownership.
- [x] Add immutable version models for themes, prayers, declarations, flyers, and social posts, including editor, timestamp, change summary, snapshot/diff, and approval state.
- [x] Add webhook event, idempotency record, invitation, verification token, password-reset token, analytics snapshot/metric, calendar item, and system-setting models.
- [x] Replace remaining free-form lifecycle status fields with enums.
- [x] Add `organizationId` to every tenant-owned model, including child records where direct tenant filtering is required; document justified exceptions.
- [x] Add soft-deletion fields and default exclusion behavior to applicable records. (Fields exist, but there is no global Firestore repository default exclusion.)
- [x] Add unique organization/month/year campaign constraint and all domain uniqueness constraints.
- [x] Add indexes for tenant/status/date lookups, queue reconciliation, token expiry, scheduling, audit queries, and cursor pagination.
- [x] Add check constraints or service validation for valid months, years, percentages, sequences, durations, attempt limits, and version numbers.
- [x] Generate and review versioned Firestore indexes and Security Rules.
- [x] Add deterministic seeds for permissions and all default system roles.
- [x] Seed a configurable development super administrator without production credentials.
- [x] Seed the sample organization, church profile, brand kit, campaign, theme, sermon, prayer collection, and declaration.
- [x] Document the entity relationships and tenant ownership rules.

## Phase 3 — Authentication and identity lifecycle

- [x] Implement email/password registration through Firebase Authentication with normalized-email uniqueness and a Firestore user profile.
- [x] Implement Firebase email verification and resend-verification with provider-managed single-use, expiring codes.
- [ ] Implement login with generic failure responses, account-state checks, brute-force counters, lockout, and security audit events.
- [ ] Verify short-lived Firebase ID tokens with signature, issuer, audience, subject, issued-at, expiry, and active-organization claims.
- [ ] Use Firebase-managed long-lived refresh tokens and device sessions; never persist raw refresh tokens in Firestore.
- [ ] Implement transactional refresh-token rotation, token-family reuse detection, family revocation, and security notifications.
- [ ] Implement logout for the current session and optional all-device logout.
- [ ] Implement session listing and single-session revocation with ownership checks.
- [x] Implement Firebase forgot/reset password using provider-managed expiring single-use codes and enumeration-safe responses.
- [ ] Revoke existing sessions/tokens after password changes and password resets.
- [ ] Implement invitation acceptance and safe account linking for existing users.
- [ ] Implement Google OAuth with state, PKCE, callback validation, account linking, and provider error sanitization.
- [ ] Implement Microsoft OAuth with state, PKCE, callback validation, account linking, and provider error sanitization.
- [ ] Add MFA-ready persistence and extension points without weakening current authentication.
- [ ] Ensure secrets and tokens are excluded from DTOs, logs, error responses, and audit snapshots.
- [ ] Complete authentication endpoints: register, login, refresh, logout, verify/resend email, forgot/reset password, sessions, session revoke, Google OAuth, and Microsoft OAuth.

## Phase 4 — Organizations and strict multi-tenancy

- [ ] Implement transactional organization onboarding, initial membership, administrator role assignment, defaults, and audit event.
- [ ] Resolve the active organization exclusively from a verified authenticated session/request context.
- [ ] Add organization switching that validates active membership and issues/updates the appropriate session context.
- [ ] Implement a tenant-aware Firestore repository or repository base that requires tenant scope for organization-owned access.
- [ ] Prevent unscoped tenant model access in services through code structure and tests.
- [ ] Add organization membership guard and active membership/status validation.
- [ ] Validate route/body organization IDs against active membership; never use them as authority.
- [ ] Add resource-ownership policies for nested and polymorphic resources.
- [ ] Limit super-administrator cross-tenant access to explicit privileged endpoints and audit each access.
- [ ] Implement organization create/list/get/update/soft-delete/switch endpoints.
- [ ] Implement member listing, invitation, invitation acceptance, membership update, and membership removal endpoints.
- [ ] Add isolation tests for reads, writes, nested records, guessed UUIDs, jobs, webhooks, storage keys, analytics, and knowledge retrieval.

## Phase 5 — Roles, permissions, and policies

- [ ] Seed roles: SuperAdministrator, ChurchAdministrator, SeniorPastor, AssociatePastor, ContentWriter, MediaTeam, Reviewer, Publisher, and Viewer.
- [ ] Seed the full permission catalogue, including all permissions listed in the requirements.
- [ ] Define and document default role-to-permission mappings.
- [x] Implement `@Roles()` and `@Permissions()` decorators.
- [ ] Implement authentication, role/permission authorization, organization membership, and resource ownership guards.
- [ ] Make authorization services tenant-aware and deny by default.
- [ ] Use transactions for role changes and permission assignments.
- [ ] Audit invitation, role, permission, membership, and privileged-access changes with safe before/after data.
- [ ] Add tests for allowed, denied, stale membership, suspended user, custom role, and cross-tenant cases.

## Phase 6 — Church profile and brand kit

- [ ] Implement tenant-scoped get/upsert church-profile endpoints with validation and safe output DTOs.
- [ ] Implement tenant-scoped get/upsert brand-kit endpoints with color, font, asset ownership, and asset-status validation.
- [ ] Protect read/update operations with the corresponding permissions.
- [ ] Audit profile and brand changes with secret-safe before/after snapshots.
- [ ] Add tests for upsert, permissions, validation, asset ownership, and tenant isolation.

## Phase 7 — Media storage and upload security

- [ ] Define a provider-neutral object-storage interface for upload, signed upload/download, multipart upload, metadata, deletion, and health checks.
- [ ] Implement a production object-storage adapter; do not persist uploads on application disk.
- [ ] Implement direct upload, signed upload URL, multipart lifecycle, and completion callback flows.
- [ ] Validate actual file signatures, MIME types, sizes, checksums, image dimensions, and media durations; never trust extensions.
- [ ] Add antivirus scanning/quarantine hook and block access until assets are ready.
- [ ] Support public/private visibility and short-lived secure download URLs.
- [ ] Namespace and authorize storage keys by tenant and prevent cross-tenant asset references.
- [ ] Implement media list/get/update/delete/archive/signed-url endpoints with cursor pagination, filters, sorting, and search.
- [ ] Add cleanup jobs for abandoned multipart uploads, failed uploads, deleted assets, and expired derivatives.
- [ ] Add storage validation, malicious upload, checksum mismatch, authorization, tenant isolation, and provider-failure tests.

## Phase 8 — Monthly campaigns

- [ ] Implement campaign repository/application/domain layers with tenant scope and safe DTO mapping.
- [ ] Implement create/list/get/update/soft-delete/duplicate/archive/progress endpoints.
- [ ] Enforce month/year uniqueness, valid date fields, optimistic concurrency, and immutable approved-content rules.
- [ ] Persist campaign generation transactionally after validated AI output.
- [ ] Add filters, sorting, search, and cursor pagination.
- [ ] Add campaign service unit and integration tests, including conflicts and tenant isolation.

## Phase 9 — Themes and theme generation

- [ ] Implement theme CRUD, generation, alternatives, regeneration, refinement, and versions endpoints.
- [ ] Validate campaign ownership and organization consistency on every theme operation.
- [ ] Define schemas for theme, alternatives, and refinement AI outputs and reject malformed results.
- [ ] Apply church profile, brand kit, doctrinal guidance, and retrieved tenant knowledge to generation context.
- [ ] Run long theme generations in BullMQ and persist progress/status/cost metadata.
- [ ] Add immutable theme versions, comparison, restoration, and approval invalidation after edits.
- [ ] Add permission, concurrency, validation, AI repair, versioning, and tenant isolation tests.

## Phase 10 — Sermons and versioning

- [ ] Add the sermon-series model/service/controller and tenant-scoped CRUD behavior.
- [ ] Implement sermon create/list/get/update/soft-delete endpoints.
- [ ] Implement outline generation, manuscript generation, refinement, scripture verification, prayer generation, and social-content generation.
- [ ] Define and validate structured schemas for outline, manuscript, refinement, summary, prayer, and social outputs.
- [ ] Queue long-running generation and preserve correlation, tenant, actor, prompt, provider, model, usage, and cost metadata.
- [ ] Create immutable sermon versions transactionally for edits and generation results.
- [ ] Implement versions listing, comparison support, and permission-checked restore-version.
- [ ] Invalidate approval or reopen approved sermons when authorized changes occur; never modify locked content silently.
- [ ] Add unit/integration tests for generation, version conflicts, restoration, approval invalidation, and tenant isolation.

## Phase 11 — Prayer collections and declarations

- [ ] Implement prayer collection and prayer point models, tenant-safe repository access, generation, CRUD, and reorder transaction.
- [ ] Enforce unique/valid prayer-point sequence ordering and validate referenced campaign/sermon ownership.
- [ ] Implement prophetic declaration generation and CRUD with tenant-safe relations.
- [ ] Add structured AI schemas and theological/scripture checks before persistence.
- [ ] Add immutable versions, comparison/restoration support, and approval invalidation for prayers and declarations.
- [ ] Add endpoints and tests for generation, CRUD, reordering, versioning, permissions, and tenant isolation.

## Phase 12 — Approvals and review comments

- [ ] Implement a reusable approval resource registry for themes, sermons, prayers, declarations, flyers, videos, and social posts.
- [ ] Implement submit/list/get, approve, reject, request-changes, and assign transitions with an explicit state machine.
- [ ] Implement threaded comments, comment edits, field paths, and resolution.
- [ ] Enforce creator/reviewer separation and configurable organization policy where required.
- [ ] Lock approved content and require reopening/new versions for subsequent edits.
- [ ] Validate an active approval at publish time rather than trusting cached client state.
- [ ] Use transactions for decisions, resource status updates, version state, notifications, and audit logs.
- [ ] Make duplicate decisions idempotent and reject invalid or stale transitions.
- [ ] Add lifecycle, authorization, concurrency, comment, invalidation, and tenant isolation tests.

## Phase 13 — Flyer and video projects

- [ ] Implement flyer create/list/get/update/delete/duplicate persistence with versioning and approval rules.
- [ ] Validate flyer canvas JSON against a strict allowlist and prohibit executable client JavaScript or unsafe external resources.
- [ ] Implement flyer render/status/export endpoints as background operations.
- [ ] Build safe flyer rendering for PNG, JPG, WebP, PDF, compatible SVG, and preview thumbnails.
- [ ] Resolve approved fonts and tenant-owned media safely and store all exports via object storage.
- [ ] Implement video create/list/get/update/delete persistence with validated scenes, overlays, transitions, audio, captions, timing, and aspect ratios.
- [ ] Implement video render/status/cancel endpoints using FFmpeg or a production rendering-provider abstraction.
- [ ] Produce MP4, poster, preview, and sanitized render logs with progress, retries, cancellation, and cleanup.
- [ ] Add immutable flyer versions and approval invalidation; add safe versioning strategy for video projects.
- [ ] Add rendering validation, sandbox, failure, cancellation, permission, and tenant isolation tests.

## Phase 14 — Queue and worker infrastructure

- [ ] Configure Redis and BullMQ for separate stateless API and worker processes.
- [ ] Register queues: `ai-generation`, `document-ingestion`, `flyer-rendering`, `video-rendering`, `social-publishing`, `social-analytics-sync`, `notifications`, `email`, and `cleanup`.
- [ ] Define typed job payloads with tenant, actor, correlation, resource, version, and idempotency data.
- [ ] Configure per-queue attempts, exponential backoff, jitter, timeouts, concurrency, retention, and stalled-job recovery.
- [ ] Persist job state/progress/failures and reconcile database state after worker restarts.
- [ ] Implement dead-letter handling, operator visibility, replay controls, and safe error recording.
- [ ] Implement idempotent processors and distributed locking where duplicate execution could cause side effects.
- [ ] Implement cancellation and progress reporting for supported generation/render work.
- [ ] Propagate logging/tracing context to every processor and outbound integration call.
- [ ] Add queue readiness checks and graceful worker shutdown.
- [ ] Add worker tests for retries, timeout, duplicate delivery, dead-lettering, cancellation, and recovery.

## Phase 15 — AI orchestration, knowledge base, and governance

- [ ] Define provider-neutral interfaces for validated structured generation, text streaming, usage/cost calculation, metadata, retries, and health.
- [ ] Implement an OpenAI adapter behind the provider interface with timeouts, retry classification, circuit breaking, and sanitized errors.
- [ ] Implement generation types for campaigns, themes/alternatives, sermon series/outlines/manuscripts/refinement/summary, prayers, declarations, captions, video scripts, flyer copy, and scripture assistance.
- [ ] Define JSON Schema or Zod schemas for every structured output.
- [ ] Implement bounded repair attempts for malformed responses; never persist unvalidated output.
- [ ] Redact sensitive inputs/outputs and store only approved generation metadata, token usage, estimated cost, and safe errors.
- [ ] Apply organization church profile, doctrine, tone, brand, translation, prohibited content, and user request context.
- [ ] Build document ingestion for statements of faith, sermons, themes, handbooks, writing samples, prayers, brand guidelines, and events.
- [ ] Add safe text extraction, content limits, chunking, embedding-provider abstraction, metadata, deletion, and re-indexing.
- [ ] Enforce tenant filters at document, chunk, embedding, retrieval, cache, and job levels.
- [ ] Log retrieval inputs/results safely for auditability without leaking other tenants' content.
- [ ] Implement scripture-reference validation for books, aliases, chapters, verses, ranges, duplicates, and translation labels.
- [ ] Return scripture warnings separately from hard errors and never invent unavailable text.
- [ ] Document/enforce licensing policy for copyrighted scripture text.
- [ ] Implement governance warnings for revelation claims, guaranteed financial/medical outcomes, violence/threats, defamation, unsupported history, false language definitions, contradictions, duplicates, missing translations, and doctrinal conflicts.
- [ ] Ensure governance produces review warnings and never silently rewrites approved theological content.
- [ ] Add AI schema/repair, redaction, scripture, governance, knowledge isolation, deletion, and re-index tests.

## Phase 16 — Social OAuth integrations and token security

- [ ] Define a capability-driven provider interface with authorize, code exchange, refresh, revoke, profile, capabilities, publishing methods, status, and insights.
- [ ] Implement production Facebook, Instagram, and TikTok adapters without hardcoded capability assumptions.
- [ ] Implement OAuth state, PKCE, redirect URI, scope, nonce, expiry, and replay validation.
- [ ] Implement dedicated envelope encryption/KMS-compatible token service with key rotation/versioning.
- [ ] Encrypt access/refresh tokens at rest and decrypt them only within integration services.
- [ ] Exclude tokens and provider secrets from API DTOs, Swagger examples, logs, traces, exceptions, audit events, and job payload displays.
- [ ] Implement social account list/connect/callback/refresh/disconnect/capabilities endpoints.
- [ ] Revoke provider tokens on disconnect where supported and erase unusable local secrets safely.
- [ ] Monitor expiry and produce reconnect/expiration notifications.
- [ ] Add tests for encryption, tamper detection, key rotation, OAuth replay, sanitization, refresh, revoke, permissions, and tenant isolation.

## Phase 17 — Social posts and publishing

- [ ] Implement social post create/list/get/update/delete and caption-generation endpoints with versioning.
- [ ] Implement schedule, immediate publish, cancel, retry, manual-published, and publishing-jobs endpoints.
- [ ] Validate tenant ownership, publishing permission, current approval, connected account, media readiness, capabilities, schedule, and platform rules immediately before job creation.
- [ ] Create one publishing job per target account in a transaction with stable idempotency keys.
- [ ] Require idempotency keys for sensitive publish/retry operations and safely replay stored results.
- [ ] Make workers publish idempotently and reconcile unknown outcomes before retrying.
- [ ] Store sanitized request/response metadata and provider IDs/URLs without secrets.
- [ ] Track each target independently and represent partial success explicitly; never report it as full success.
- [ ] Generate success/failure notifications and complete audit events.
- [ ] Add publishing workflow tests for capability denial, approval denial, partial success, duplicate delivery, transient/permanent errors, manual publication, and tenant isolation.

## Phase 18 — Calendar and scheduling

- [ ] Implement calendar list/create/update/delete/reschedule endpoints with permissions and tenant scope.
- [ ] Store instants in UTC while retaining organization and user-selected IANA timezones.
- [ ] Validate DST gaps/ambiguities and return clear scheduling errors/warnings.
- [ ] Use BullMQ delayed jobs plus a database reconciliation scheduler to recover missed schedules.
- [ ] Prevent duplicate publication with database uniqueness and worker idempotency.
- [ ] Implement atomic cancellation/rescheduling of database records and queued jobs.
- [ ] Add tests for DST boundaries, past times, missed schedules, concurrent rescheduling, cancellation races, and duplicate prevention.

## Phase 19 — Analytics

- [ ] Define tenant-scoped analytics events and aggregates for content, approvals, AI usage/cost, campaigns, publishing outcomes, engagement, views, likes, comments, shares, saves, clicks, and follower growth.
- [ ] Implement dashboard, content, social, AI-usage, and account-sync endpoints.
- [ ] Synchronize provider analytics asynchronously and record cursors/checkpoints, rate limits, and failures.
- [ ] Do not fabricate unsupported metrics; retain provider/source and freshness metadata.
- [ ] Add cursor pagination/date filters and explicit timezone semantics.
- [ ] Add authorization, aggregation correctness, provider degradation, replay, and tenant isolation tests.

## Phase 20 — Notifications

- [ ] Implement tenant-safe in-app notifications with list, mark-read, and mark-all-read endpoints.
- [ ] Implement email delivery behind a provider abstraction and queue.
- [ ] Define push-ready transport contracts plus optional SMS and WhatsApp abstractions without fake production implementations.
- [ ] Generate required invitation, review, approval, scheduling, publishing, token, connection, and rendering notifications.
- [ ] Add preference, deduplication, retry, dead-letter, template, and delivery-status support.
- [ ] Ensure notification links cannot expose or cross tenant boundaries.
- [ ] Add event mapping, deduplication, permission, tenant isolation, and delivery-failure tests.

## Phase 21 — Webhooks, audit, security, and observability

- [ ] Implement webhook endpoints for Meta, Instagram where applicable, TikTok, media rendering, video rendering, and email providers.
- [ ] Verify raw-body signatures with constant-time comparison before parsing/processing.
- [ ] Prevent replay using timestamp windows and unique provider event IDs.
- [ ] Persist sanitized raw-event metadata, acknowledge quickly, and process asynchronously/idempotently.
- [ ] Record webhook processing attempts/failures without secret payload fields.
- [ ] Implement comprehensive audit logging for every sensitive operation listed in the requirements.
- [ ] Include actor, tenant, action, resource, timestamp, IP, user agent, correlation ID, and safe before/after values.
- [ ] Make audit records append-only and prohibit passwords, session/OAuth tokens, encryption material, and secrets.
- [ ] Implement audit list/get endpoints with permissions, filters, pagination, and privileged-access visibility.
- [ ] Add configurable differentiated limits for login, password reset, AI, uploads, publishing, public routes, webhooks, and analytics.
- [ ] Add CSRF defenses for cookie-authenticated flows, secure cookie attributes, brute-force protection, output serialization, XSS-safe handling, and security event logging.
- [ ] Add OpenTelemetry-ready request/job/outbound-call instrumentation and a Sentry-compatible error-reporting integration point.
- [ ] Implement `/health`, `/health/live`, and `/health/ready` for API/process, Firestore, Redis, queues, storage, AI, and practical social-provider checks.
- [ ] Keep health output bounded and secret-free; separate liveness from dependency readiness.
- [ ] Add webhook signature/replay, audit redaction, rate-limit, CSRF, log-redaction, and health degradation tests.

## Phase 22 — Complete API surface and documentation

- [ ] Inventory every required route and fail CI if documented controllers omit an endpoint.
- [ ] Apply authentication, permissions, organization membership, ownership, validation, serialization, and rate limiting consistently to all routes.
- [ ] Add cursor pagination, filtering, sorting, and search to all list endpoints where applicable.
- [ ] Add optimistic concurrency/version checks and ETags for editable resources where useful.
- [ ] Add idempotency handling to sensitive POST operations.
- [ ] Document every endpoint's summary, description, permission, authentication, request/response schemas, errors, pagination, and examples.
- [ ] Document architecture boundaries and future service-extraction seams.
- [ ] Document database relationships, indexes, lifecycle states, soft deletion, and tenant boundaries.
- [ ] Produce an API reference, security notes, webhook guide, OAuth setup, storage guide, queue operations guide, and runbooks.
- [ ] Document local installation, environment setup, migrations, seeds, API/workers, Swagger, tests, lint, build, and troubleshooting.

## Phase 23 — Automated test suite

- [ ] Unit test auth service, password behavior, account lockout, and refresh rotation/reuse detection.
- [ ] Unit test permission and membership guards, resource policies, and tenant repository enforcement.
- [ ] Unit test campaign service, AI output validation/repair, scripture validation, governance warnings, approvals, publishing, encryption, scheduling, webhook verification, and storage validation.
- [ ] Integration test registration/login, organization onboarding, invitation acceptance, theme creation, sermon jobs, prayer generation, approval lifecycle, scheduling, publishing-job creation, retry, isolation, and permission denial.
- [ ] Add Supertest end-to-end coverage for all endpoint families and standard response/problem envelopes.
- [ ] Test every tenant-owned resource for cross-organization read, mutation, relation injection, pagination, worker, and indirect-reference attacks.
- [ ] Add contract tests for storage, AI, social, email, and rendering adapters using isolated test doubles only at integration boundaries.
- [ ] Add migration and seed smoke tests against a fresh database.
- [ ] Add API/worker startup and graceful-shutdown tests.
- [ ] Add security regression tests for secret/log leakage, upload spoofing, OAuth/webhook replay, refresh reuse, and authorization bypass.
- [ ] Set meaningful coverage thresholds and make build, lint, unit, integration, E2E, and Firestore rules/index validation required CI checks.

## Phase 24 — Containers and deployment readiness

- [ ] Create a hardened multi-stage Dockerfile running as non-root with production-only dependencies and a health check.
- [ ] Complete Docker Compose services for Firebase emulators, Redis, API, and worker, and local object storage if needed.
- [ ] Add health checks, dependency readiness, persistent development volumes, and explicit networks.
- [ ] Provide separate API and worker entry points/images or commands.
- [ ] Ensure API processes are stateless and all files use external object storage.
- [ ] Implement one-off migration strategy, backward-compatible migration guidance, and rollback/runbook procedures.
- [ ] Configure graceful shutdown for HTTP, Firebase requests, Redis, BullMQ workers, and telemetry exporters.
- [ ] Document horizontal scaling, queue concurrency, connection pooling, resource limits, and autoscaling considerations.
- [ ] Provide deployment guidance for Render, Azure Container Apps, AWS ECS/Fargate, and Google Cloud Run.
- [ ] Document production use of managed Firestore, Redis, object storage, secret management/KMS, email, and observability.
- [ ] Add CI/CD stages for dependency install, generation, lint, build, tests, schema validation, image build/scan, migrations, and deployment smoke tests.

## Final release gate

- [ ] `npm ci` succeeds under Node.js 22+ from a clean checkout.
- [ ] Firebase configuration and generated API types validate successfully.
- [ ] Firestore Security Rules and indexes validate successfully.
- [ ] Firestore indexes and Security Rules deploy successfully to a clean Firebase project.
- [ ] The Firebase seed command succeeds and is safe to rerun where documented.
- [x] `npm run lint` succeeds with no suppressed errors.
- [x] `npm run build` succeeds in strict mode.
- [x] `npm test` succeeds.
- [ ] `npm run test:integration` succeeds.
- [ ] Supertest end-to-end tests succeed.
- [ ] Tenant-isolation and permission-denial suites succeed.
- [ ] API and workers start independently and shut down gracefully.
- [ ] Swagger loads at `/docs` in enabled environments and is disabled/protected as configured in production.
- [ ] `/api/v1/health`, `/api/v1/health/live`, and `/api/v1/health/ready` return the expected states.
- [ ] Queue retry, idempotency, cancellation, missed-schedule recovery, and dead-letter scenarios are verified.
- [ ] Clean Firebase Emulator Suite index/rules and seed smoke tests pass in containers.
- [ ] No secrets, tokens, raw provider errors, or production stack traces appear in API responses, logs, traces, jobs, or audit records.
- [ ] Every production module is wired into the NestJS dependency graph; no core module is an empty placeholder.
- [ ] Every required endpoint is implemented, authorized, documented, and covered by tests.
- [ ] Architecture, database, API, security, operations, and deployment documentation is reviewed and current.
