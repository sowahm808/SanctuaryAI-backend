# Frontend implementation guide

This guide translates the persistence model into client-side boundaries. The API remains authoritative for authorization, tenancy, lifecycle transitions, validation, and publish eligibility.

## Application shell and tenant context

After authentication, load the user's active memberships and require an organization selection when more than one is active. Keep the selected organization in the authenticated server session/token flow—not only local storage. Show organization switching as a server operation and invalidate all tenant-scoped query caches after it succeeds. Never send an arbitrary `organizationId` as proof of access.

Build navigation from server-returned permissions. Hiding a control improves usability but is not security; handle `401`, `403`, `404`, and `409` on every operation. A useful shell groups Campaigns, Content, Prayer & Declarations, Media, Social, Approvals, Knowledge, Analytics, Members, and Settings.

## Shared TypeScript contracts

Generate API types from Swagger rather than copying internal persistence types into the browser. Persistence records contain internal fields and secrets that response DTOs must omit. Model lifecycle values as string unions generated from the API enums, and use exhaustive rendering so a newly-added state fails CI instead of silently appearing blank.

Use one standard entity shape for editable resources:

```ts
type EntitySummary<Status extends string> = {
  id: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

Treat UUIDs as opaque strings and timestamps as ISO-8601 instants. Format them in the organization's timezone. Decimal analytics values should remain strings until formatted to avoid floating-point loss; large media byte sizes should also remain strings.

## Screens and workflows

1. **Campaign workspace:** month/year picker, unique-conflict handling, progress, theme, sermon series/sermons, prayers, and declarations. Constrain month to 1–12 and year to the supported API range.
2. **Versioned editors:** themes, sermons, prayer collections, declarations, flyers, and social posts need history drawers. Save with a required change summary; show editor/time/approval state and snapshot comparison. Restoration creates a new version rather than mutating history.
3. **Approval inbox:** filter by status/assignee/date, render threaded review comments, field paths, resolution, and explicit approve/reject/request-changes actions. Disable editing approved content until the API reopens or versions it.

For the concrete approval response contract, submit routes, cache invalidation rules, filters, and an Angular diagnostic checklist, see [Approval center frontend integration guide](./APPROVAL_FRONTEND_INTEGRATION_GUIDE.md).
4. **Media library and brand kit:** expose upload/processing/quarantine/ready states. Only ready, same-tenant assets can be selected for logos or content. Do not expose storage keys or provider credentials.
5. **Social planner:** calendar/list views, per-platform account selection, timezone-aware scheduling, approval state, publishing jobs, bounded retry feedback, and partial-publication details.
6. **Knowledge base:** ingestion status and document/chunk metadata without embedding vectors. Offer retry/delete only when permissions and state allow it.
7. **Administration:** members/invitations/roles, church profile, settings, audit log, and analytics. Never display token hashes, encrypted tokens, webhook payload secrets, or AI prompts marked sensitive.

## Data fetching and errors

Use cursor pagination with the opaque cursor returned by the API; never construct it from page numbers. Include status/date/search filters in query keys. Optimistically update only reversible, non-lifecycle fields. Approval, publishing, restoration, invitations, and generation should wait for the server response and use an idempotency key for retryable creates.

The global response is `{ data, meta, correlationId }`. Parse RFC 7807 error responses centrally, display safe field errors, and include the correlation ID in support affordances. For `409`, refresh the record and present comparison/retry choices. Poll jobs with bounded backoff (or subscribe when an event transport exists), stop at terminal enum states, and reconcile once more on focus/reconnect.

## Form and accessibility checklist

- Mirror server constraints: positive sequences/versions/durations, 0–100 percentages, valid start/end ranges, and attempt limits. Server errors still win.
- Require confirmation for destructive/archive/revoke actions and label soft deletion as archive/trash where appropriate.
- Use text labels in addition to status color, announce async status changes, retain keyboard focus after dialogs, and make editor/version comparisons keyboard navigable.
- Warn about unsaved edits and preserve drafts locally without caching credentials or sensitive provider data.
- Test permission variants, tenant switching, stale versions, expired sessions/tokens, empty/error/loading states, cursor continuation, timezone boundaries, and every terminal job state.

## Recommended delivery order

Start with generated contracts, auth/session handling, tenant switching, error parsing, permission gates, and shared status components. Then deliver campaigns and versioned content, approvals, media/projects, social planning, and finally administration/analytics/knowledge screens. Add contract tests against the OpenAPI document and end-to-end tests proving that tenant cache data is cleared on logout and organization switch.
