# Firestore data model

Cloud Firestore is the sole application database. Firebase Authentication is the identity authority; `users/{uid}` mirrors only safe profile and application-state fields. It must never contain passwords, ID tokens, refresh tokens, private keys, or OAuth provider tokens.

## Collection conventions

Top-level collections use plural lower-case names (`users`, `organizations`, `memberships`, `campaigns`, `themes`, `sermons`, and so on). Tenant-owned documents store `organizationId` directly even when nested below another resource. This deliberate denormalization makes tenant predicates reviewable and supports compound indexes. References are stable Firestore document IDs, timestamps are Firestore timestamps, and lifecycle values use documented string enums.

Soft-deletable documents use `deletedAt`. Repository methods exclude deleted documents by default. Immutable content versions live in dedicated version subcollections and record editor UID, creation timestamp, change summary, snapshot/diff, and approval state.

## Authorization boundary

The API service account bypasses Firestore Security Rules. Every organization-owned operation must derive the active organization from a verified Firebase identity and active membership, apply `organizationId` to every query, and verify related resources belong to that same tenant. Rules are defense in depth for any direct client access, not a substitute for backend checks.

## Indexes and evolution

Compound query indexes and Security Rules must be committed in `firestore.indexes.json` and `firestore.rules` before domain collections are considered implemented. Data evolution uses versioned, idempotent migration scripts and emulator tests rather than relational migrations. Those artifacts are still outstanding and remain unchecked in `todo.md`.
