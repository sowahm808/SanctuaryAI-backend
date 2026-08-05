# SanctuaryAI Backend

NestJS backend for SanctuaryAI using **Firebase Authentication** for identity and **Cloud Firestore** as its production database.

## Local setup

1. Install the Node.js version in `.nvmrc` and the npm version declared in `package.json`.
2. Run `npm ci`, copy `.env.example` to `.env`, and configure a Firebase project.
3. Enable Email/Password authentication in Firebase Authentication. Configure authorized domains and password policy in the Firebase console.
4. Create a least-privilege service account with Firestore access. Put its email and private key in a secret manager and expose them through `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
5. Start the API with `npm run start:dev`. Swagger is served at `http://localhost:3000/docs` when enabled.

For a production-style local run, use `npm start`. Its `prestart` lifecycle
automatically compiles the TypeScript sources before Node.js launches
`dist/main.js`, so a fresh checkout does not require a separate manual build.

The API uses Firebase's Identity Toolkit endpoints for the legacy registration,
sign-in, refresh, verification-email, and password-reset-email operations. The
active browser flow posts a Firebase ID token to `POST /api/v1/auth/firebase`.
After verifying the token, the backend resolves the user's active membership and
organization and returns the canonical application session. It stores only a
SHA-256 digest of a random application session identifier in Firestore and sets
the identifier in an HTTP-only `__session` cookie; the Firebase token and
authorization claims are never placed in that cookie.

Verified users who have not created or joined an organization receive an
authenticated onboarding session with null organization and role fields, empty
permissions, and inactive setup/subscription flags. Invalid, suspended, or
unsupported existing memberships remain forbidden.

`GET /api/v1/auth/session` restores that application session and re-reads the
current membership, organization, permissions, onboarding state, and
subscription state. `POST /api/v1/auth/logout` deletes the session and expires
the cookie, and is safe to call repeatedly. Browser clients must send
credentials. The backend validates Firebase signatures, issuer, audience,
subject, issue time, and expiry against Google's published certificates. Never
use a decoded-but-unverified token as request context.

Authentication endpoints are served under `/api/v1/auth`, including
`POST /api/v1/auth/login`, `POST /api/v1/auth/firebase`, and
`GET /api/v1/auth/session`. The Firebase endpoint accepts a client-authenticated
Firebase ID token as `{ "idToken": "..." }`, verifies it, and returns an
unwrapped `AuthResult`; session restoration returns an unwrapped `AuthSession`.
Older clients that call
the legacy `/auth/*` and `/api/auth/*` paths remain supported and are
internally routed to the versioned endpoints. A `404 NOT_FOUND` response during
login usually means the client is posting to a different path (for example
`/login`) rather than an authentication failure; authentication failures from
the login endpoint return `401 Unauthorized`.

## Database

All application persistence goes through `FirebaseService.firestoreRequest`. It obtains short-lived Google OAuth access tokens from the configured service account; no long-lived database bearer token is stored. Tenant-owned Firestore documents must retain an `organizationId`, and services must derive that value from authenticated membership rather than request bodies. Firestore Security Rules remain defense in depth: Admin/service-account requests bypass them, so backend authorization is mandatory.

For local development set `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`. Production must not set emulator variables. The former PostgreSQL/Prisma artifacts were removed to avoid two competing sources of truth.

## Checks

Run `npm run build`, `npm run lint`, and `npm test`. See [architecture](docs/ARCHITECTURE.md), the [backend API route guide](docs/BACKEND_API_ROUTE_GUIDE.md), and the audited [implementation checklist](todo.md).
