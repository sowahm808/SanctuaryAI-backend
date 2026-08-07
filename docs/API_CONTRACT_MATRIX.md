# Frontend/backend contract matrix

Audit date: 2026-08-07. The Angular repository was not present in the supplied workspace; frontend contracts below are derived from the audit in the remediation request. `Persisted` means the current handler writes/reads Firestore, not that its lifecycle is production-complete.

| Feature | Frontend route | Backend route | Frontend request | Backend DTO | Frontend response | Backend response | Implemented | Persisted | Queued | Approval |
|---|---|---|---|---|---|---|---:|---:|---:|---:|
| themes | `/api/themes[/:id]` | `/api/v1/themes[/:id]` | brief + `expectedRevision` | `ThemeInputDto`, `ThemeDraftUpdateDto` | theme/page | theme/page | yes | yes | typed Theme queue | legacy actions |
| sermons | `/api/sermons` | `/api/v1/sermons` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no (501) | generic |
| prayers | `/api/prayers` | `/api/v1/prayers` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no (501) | generic |
| declarations | `/api/declarations` | `/api/v1/declarations` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no (501) | generic |
| campaigns | `/api/campaigns` | `/api/v1/campaigns` | campaign DTOs | campaign DTOs | item/page | item/page | yes | yes | no | no |
| flyers | `/api/flyers` | `/api/v1/flyers` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no (501) | generic |
| videos | `/api/videos` | `/api/v1/videos` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no (501) | generic |
| media | `/api/media` | `/api/v1/media` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no | no |
| social/posts | `/api/social-posts` | `/api/v1/social` | workflow mutation | `WorkflowMutationDto` | item/page | social-account page | mismatch | yes | no | no |
| publishing | `/api/publishing` | `/api/v1/publishing` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | export only | generic |
| calendar | `/api/calendar` | `/api/v1/calendar` | workflow mutation | `WorkflowMutationDto` | item/page | item/page | partial | yes | no | no |
| approvals | `/api/approvals[/:id/actions]` | generic `/api/v1/approvals[/:id/actions]` | decision/assign/comment | partially typed | review aggregate | workflow item | partial | yes | no | generic |
| reviews | `/api/reviews` | `/api/v1/reviews` | workflow mutation | partially typed | review page | separate `reviewItems` page | legacy overlap | yes | no | generic |
| users | `/api/users?filter[eligibleFor]=review` | `/api/v1/users` | list query | `WorkflowListQueryDto` | eligible users | membership-backed users | yes | yes | no | permission filtered |
| notifications | `/api/notifications` | `/api/v1/notifications` | workflow mutation | partially typed | item/page | item/page | partial | yes | no | no |
| audit | `/api/audit` | `/api/v1/audit` | list/export | partially typed | event/page | export records/page | mismatch | yes | export stub | no |
| analytics | `/api/analytics` | `/api/v1/analytics` | list/export | partially typed | report/page | report/page | partial | yes | export stub | no |
| jobs | `/api/jobs/:id[/cancel]` | `/api/v1/jobs/:id[/cancel]` | none | path params | job | persisted job | yes | yes | Theme only | no |

## Deliberate compatibility decisions

* `/themes/:id` is the canonical creator draft-save route. `/input` remains an editor compatibility route and `/output` remains a generated-output editor route.
* Generic generation now fails explicitly with `501 generation_not_supported`; it never creates an `asyncJobs` row that has no BullMQ processor.
* `reviews` remains documented as legacy overlap. It must be migrated into a concrete approval aggregate before removal; silently synchronizing two records was rejected.

