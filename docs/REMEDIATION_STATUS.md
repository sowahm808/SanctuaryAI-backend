# Backend remediation status

## Fixed

* Canonical Theme draft save with optimistic revision enforcement.
* Theme compatibility cancellation delegates to the real tenant-owned job cancellation service.
* Firestore-backed, tenant-scoped generic lists with soft-delete exclusion, safe sorts, search/filter support and cursor pages.
* Reviewer selection is derived from active memberships and review permissions rather than all users.
* Fake generic generation jobs were removed; unsupported generation is explicit.
* API and worker startup commands are separated; the API does not register processors unless `WORKERS_ENABLED=true`.
* Composite index declarations cover tenant/time and requested approval query shapes.

## Deferred intentionally

* Typed prayer, declaration, sermon, flyer, and video processors. These routes return `generation_not_supported` until each processor exists.
* Dedicated approval aggregate/controller, version subcollections, transactional orchestration, notifications and the full state machine.
* Migration of embedded `versions`/`comments` and consolidation of `reviewItems` into approvals.
* Full auth session inventory/reuse defenses and concrete publishing orchestration.

## Blocked

* Browser acceptance and frontend source-level verification: no Angular repository, deployed Firebase project, Redis worker, OpenAI credentials, or browser environment was supplied in this workspace.
* Production lifecycle acceptance for Prayer and Declaration is blocked by the intentionally absent typed workers above. The backend must not represent those operations as queued meanwhile.
