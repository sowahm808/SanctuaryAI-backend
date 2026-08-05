# Backend API route guide

This guide audits the frontend API calls that currently leave the Angular app and lists the backend routes that must exist behind the same-origin `/api` proxy. It is intended to help backend maintainers fix route mismatches, missing handlers, envelope inconsistencies, and auth-cookie issues without reverse-engineering the frontend.

## Routing baseline

The browser never calls the Render origin directly. Both development and production call same-origin `/api`, and infrastructure rewrites that path to the backend version prefix:

| Environment              | Browser URL prefix | Backend URL prefix after proxy                    | Config source     |
| ------------------------ | ------------------ | ------------------------------------------------- | ----------------- |
| Local Angular dev server | `/api`             | `https://sanctuaryai-backend.onrender.com/api/v1` | `proxy.conf.json` |
| Netlify production       | `/api`             | `https://sanctuaryai-backend.onrender.com/api/v1` | `netlify.toml`    |

Backend route handlers should therefore be mounted at `/api/v1/*`. Do not redirect proxied requests from `/api/v1/*` to another origin; redirects can break credentialed cookie behavior and make the frontend report network/auth failures instead of typed API errors.

## Global request requirements

- All authenticated requests are sent with `withCredentials: true`; backend cookies must be valid for the proxied `/api` flow.
- State-changing routes should accept JSON request bodies and return JSON unless the route explicitly has an empty success body.
- Feature services expect successful non-auth responses to use `{ "data": ..., "correlationId": "..." }`.
- `GET /auth/session` may return an unwrapped session or `{ "data": <session>, "correlationId": "..." }` during transition.
- Return `X-Correlation-ID` on success and failure. Error bodies should use stable problem codes and safe validation details.
- Resolve organization, role, permissions, and subscription from the server session on every request. Ignore organization IDs from the browser unless the endpoint explicitly supports selecting among memberships already authorized for the session.

## Auth routes currently represented in the frontend

All paths below are backend paths after the proxy prefix, so implement them under `/api/v1`.

| Method | Path                       | Current frontend usage                                                                 | Expected success response                                                                              |
| ------ | -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/auth/session`            | Route guard and session restore                                                        | `AuthSession` or `{ data: AuthSession, correlationId }`                                                |
| `POST` | `/auth/firebase`           | Active email/password, registration, and Google flows exchange Firebase ID tokens here | `AuthResult`, `AuthSession`, wrapped equivalent, or acknowledgement followed by a valid session cookie |
| `POST` | `/auth/invitations/accept` | Invitation acceptance form                                                             | `AuthResult`                                                                                           |
| `POST` | `/auth/mfa/verify`         | MFA challenge completion                                                               | `AuthSession`                                                                                          |
| `POST` | `/auth/password/reset`     | Token-based backend password reset client method                                       | Empty `2xx`                                                                                            |
| `POST` | `/auth/email/verify`       | Email verification client method                                                       | Empty `2xx`                                                                                            |
| `POST` | `/auth/logout`             | Logout flow; frontend clears state even if request fails                               | Empty `2xx`; idempotent                                                                                |
| `POST` | `/auth/login`              | Typed client exists but current UI does not use it                                     | `AuthResult` if retained                                                                               |
| `POST` | `/auth/register`           | Typed client exists but current UI does not use it                                     | `AuthResult` if retained                                                                               |
| `POST` | `/auth/password/forgot`    | Typed client exists; Firebase reset email is currently active in the page              | Empty `2xx` if retained                                                                                |

Common route issue: implementing only `/auth/login` and `/auth/register` is insufficient for the current UI. The active login path is Firebase Web SDK first, then `POST /api/v1/auth/firebase`.

## Feature routes currently called by API-backed screens

These are the concrete routes emitted by the shared `ApiClientService` and current feature services.

| Method | Path                                                | Frontend purpose                                               | Response `data` shape |
| ------ | --------------------------------------------------- | -------------------------------------------------------------- | --------------------- |
| `POST` | `/organizations`                                    | Create or join an organization from onboarding                 | `ChurchProfile`       |
| `GET`  | `/dashboard/summary`                                | Dashboard landing-page read model                              | `DashboardSummary`    |
| `POST` | `/campaigns`                                        | Create a campaign draft from the campaign generator brief      | `CampaignDraft`       |
| `POST` | `/campaigns/:campaignId/generate`                   | Generate all campaign sections                                 | `AsyncJob`            |
| `POST` | `/campaigns/:campaignId/sections/:scope/regenerate` | Regenerate a single campaign section                           | `AsyncJob`            |
| `POST` | `/sermons`                                          | Create a sermon draft                                          | `SermonRecord`        |
| `PUT`  | `/sermons/:id/draft`                                | Save a sermon draft                                            | `SermonRecord`        |
| `POST` | `/sermons/:id/submit-review`                        | Submit sermon for review                                       | `SermonRecord`        |
| `GET`  | `/sermons/:id`                                      | Read sermon or conflict-check latest revision                  | `SermonRecord`        |
| `GET`  | `/sermons/:id?revision=:revision`                   | Read a specific sermon revision for conflict checks            | `SermonRecord`        |
| `POST` | `/sermons/:id/exports`                              | Request sermon export                                          | Sermon `AsyncJob`     |
| `POST` | `/sermons/:id/ai-jobs`                              | Run an AI edit/generation job for a sermon section or document | Sermon `AsyncJob`     |
| `POST` | `/themes`                                           | Create a generic workflow draft for theme workflows            | `WorkflowDraft`       |
| `POST` | `/themes/:id/generate`                              | Generate a theme workflow                                      | `AsyncJob`            |
| `POST` | `/prayers`                                          | Create a prayer-points workflow draft                          | `WorkflowDraft`       |
| `POST` | `/prayers/:id/generate`                             | Generate prayer points                                         | `AsyncJob`            |
| `POST` | `/declarations`                                     | Create a declaration workflow draft                            | `WorkflowDraft`       |
| `POST` | `/declarations/:id/generate`                        | Generate declarations                                          | `AsyncJob`            |

Common route issue: the broader delivery backlog describes future `POST /campaigns/drafts`, but the current frontend calls `POST /campaigns`. Backend teams can either support `POST /campaigns` now or coordinate a frontend change before removing that route.

## Shared collection routes the frontend API client can emit

The shared client exposes these conventional routes for every allowed API group, even if not all are wired to active screens yet. Implementing consistent handlers across groups will reduce future route defects.

Allowed groups are: `organizations`, `dashboard`, `themes`, `campaigns`, `sermons`, `prayers`, `declarations`, `flyers`, `videos`, `media`, `approvals`, `social-accounts`, `social-posts`, `calendar`, `analytics`, `notifications`, `users`, and `audit`.

For a group named `:group`, the client can emit:

| Method             | Path                                                                | Notes                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`              | `/:group?cursor=&limit=&search=&sort=&direction=&filter[key]=value` | Returns a cursor page in `{ data: { items, nextCursor?, previousCursor?, total? }, correlationId }`.                                                |
| `GET`              | `/:group/:id`                                                       | ID segment is URL-encoded by the client.                                                                                                            |
| `POST`             | `/:group`                                                           | Creates a resource and returns the created read model.                                                                                              |
| `PATCH`            | `/:group/:id`                                                       | Partial update with optimistic concurrency when applicable.                                                                                         |
| `DELETE`           | `/:group/:id`                                                       | Returns empty success body.                                                                                                                         |
| `GET`/`POST`/`PUT` | `/:group/:resource`                                                 | Resource strings are used for nested actions such as `summary`, `:id/generate`, or `:id/draft`. Backend route matching must handle nested segments. |

For list endpoints, accept repeated `filter[key]` query parameters and scalar query strings. Keep pagination cursor values opaque.

## Response-shape checklist

Use this checklist when a frontend route appears to fail despite the handler existing:

1. Verify the deployed handler path includes `/api/v1`, not only `/api` or an unversioned path.
2. Verify CORS is not involved for browser calls; the app expects same-origin proxying and credentialed cookies.
3. Verify successful feature responses are wrapped with a top-level `data` property. Missing `data` makes feature services render empty/error states.
4. Verify auth-session responses include `organizationSetupComplete` and `subscriptionActive` booleans. Missing booleans are treated as false.
5. Verify `permissions` is a JSON array of strings, not a serialized set/object.
6. Verify mutation routes accept an empty JSON object where the frontend sends `{}`; do not reject it as a malformed body.
7. Verify async routes return an `AsyncJob` with `id`, `status`, `progress`, and safe error details when failed.
8. Verify protected routes return `401` only for unusable sessions, `403` for permission denial, `409` for revision conflicts, and `422` for validation.

## Backend acceptance smoke tests

Run these against the deployed backend through the same proxy path used by the frontend whenever possible:

```bash
curl -i https://<frontend-host>/api/auth/session
curl -i -X POST https://<frontend-host>/api/auth/firebase -H 'Content-Type: application/json' --data '{"idToken":"invalid"}'
curl -i https://<frontend-host>/api/dashboard/summary
```

Expected unauthenticated behavior is a safe `401` problem response with `X-Correlation-ID`, not a redirect to HTML, a missing route `404`, or a CORS preflight failure.
