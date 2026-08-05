# Firestore data model

Cloud Firestore is the sole application database. Firebase Authentication is the identity authority; `users/{uid}` mirrors only safe profile and application-state fields. It must never contain passwords, ID tokens, refresh tokens, private keys, or OAuth provider tokens.

## Collection conventions

Top-level collections use plural lower-case names (`users`, `organizations`, `memberships`, `campaigns`, `themes`, `sermons`, and so on). Tenant-owned documents store `organizationId` directly even when nested below another resource. This deliberate denormalization makes tenant predicates reviewable and supports compound indexes. References are stable Firestore document IDs, timestamps are Firestore timestamps, and lifecycle values use documented string enums.

Soft-deletable documents use `deletedAt`. Repository methods exclude deleted documents by default. Immutable content versions live in dedicated version subcollections and record editor UID, creation timestamp, change summary, snapshot/diff, and approval state.

## Authorization boundary

The API service account bypasses Firestore Security Rules. Every organization-owned operation must derive the active organization from a verified Firebase identity and active membership, apply `organizationId` to every query, and verify related resources belong to that same tenant. Rules are defense in depth for any direct client access, not a substitute for backend checks.

## Indexes and evolution

Compound query indexes and Security Rules must be committed in `firestore.indexes.json` and `firestore.rules` before domain collections are considered implemented. Data evolution uses versioned, idempotent migration scripts and emulator tests rather than relational migrations. Those artifacts are still outstanding and remain unchecked in `todo.md`.

## Phase 2 model inventory

The committed model contract is represented in TypeScript interfaces under `src/database/firestore`. All document IDs and cross-document foreign keys are UUID strings unless the Firebase-owned UID is explicitly called out. Firestore has no cascading deletes, so referential actions are service-enforced: soft-delete parent records, reject cross-tenant references, and create immutable child versions transactionally with parent edits.

### Lifecycle enums

Lifecycle state is constrained to enums for users, organizations, memberships, content, approvals, social platforms, social posts, publishing jobs, AI generations, media assets, renders, notifications, and campaigns. New lifecycle fields must reuse these enums or add a reviewed enum instead of introducing free-form status strings.

### Tenant ownership

Every tenant-owned root and child model stores `organizationId` directly: memberships, roles, church profiles, brand kits, campaigns, themes, sermon series, sermons, sermon versions, prayer collections, prayer points, declarations, media assets, flyer/video projects and templates, social accounts/posts, publishing jobs, approvals, review comments, notifications, AI generations, audit logs, knowledge-base documents/chunks/embeddings, ingestion/retrieval records, invitations, idempotency records, analytics snapshots, and calendar items. The justified exceptions are global identity/security/operations records that must not be tenant-readable directly: `users`, `sessions`, verification tokens, password-reset tokens, webhook events, and system settings.

### Uniqueness and validation

Firestore uniqueness is modeled with deterministic constraint documents. Monthly campaigns reserve `campaignUniqueness/{organizationId}_{year}_{month}` in the same transaction as `campaigns/{campaignId}`. Service validation enforces UUID shape, month `1..12`, years `2000..2100`, percentages `0..100`, positive sequence/duration/version numbers, and bounded attempt counts.

### Seed data

`firestore-seed.ts` defines deterministic permission keys, default system roles, a configurable development super administrator using `DEV_SUPER_ADMIN_EMAIL` with an `.invalid` fallback, and sample organization data for a church profile, brand kit, monthly campaign, theme, sermon, prayer collection, and prophetic declaration. The seed constants are intentionally credential-free so the eventual emulator/production seed runner can be safely rerun.

### Indexes and rules

`firestore.indexes.json` contains the versioned compound indexes needed for tenant/status/date lookups, queue reconciliation, token expiry, scheduling, audit queries, and cursor-style pagination. `firestore.rules` keeps writes server-only, allows direct reads only for active members of a document's `organizationId`, and blocks direct client access to session, token, webhook, uniqueness-constraint, and system-setting records.
