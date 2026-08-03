# Architecture

## Runtime boundary

The stateless NestJS API owns validation, authorization, orchestration, and safe response serialization. Firebase Authentication owns passwords, identity-provider federation, refresh tokens, verification, and password reset. Cloud Firestore is the sole application database. Redis remains reserved for queues and distributed coordination.

## Authentication flow

1. Email/password operations are proxied to the Firebase Identity Toolkit REST API so private credentials never enter Firestore.
2. Firebase returns an ID token and refresh token. The API verifies every ID token with Google's cached public certificates and validates its `RS256` algorithm, `kid`, issuer, audience, subject, issue time, and expiry.
3. `FirebaseAuthGuard` writes the verified identity to request context. Controllers use `CurrentUser`; request-supplied user IDs are never authoritative.
4. Password reset and email verification are delegated to Firebase-generated, single-use out-of-band codes.

## Firestore access

`FirebaseService` signs a short-lived OAuth assertion with the service-account private key, exchanges it for a scoped access token, caches it only until shortly before expiry, and calls the Firestore REST API. The emulator path uses the documented owner token. The service account bypasses Firestore Security Rules, therefore tenant membership and resource ownership must be checked in application services before every read or write.

Collections use plural lower-case names. User profiles are stored at `users/{firebaseUid}`. Tenant resources must store `organizationId` directly to make security review and indexed filtering possible. Soft-deletable documents use `deletedAt`; repositories must exclude them unless an explicit restoration flow requests them.

## Remaining implementation

The Firebase foundation and identity routes are implemented. Most product-domain controllers, worker infrastructure, provider adapters, tenant repositories, and automated integration suites remain outstanding and are intentionally left unchecked in `todo.md`; a schema scaffold is not treated as production completion.
