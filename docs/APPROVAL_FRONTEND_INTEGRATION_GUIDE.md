# Approval center frontend integration guide

This audit is for the Angular approval page. The backend fix makes legacy active approval records readable, but the frontend must still load the correct collection, preserve the API envelope, and refresh the queue after submission or decisions.

## What the two responses mean

`GET /api/approvals` is the queue source. An envelope whose `data.items` is empty means there are no actionable approval documents for the active organization and current filters. It is not populated from content drafts or from the eligible-user response.

`GET /api/users?filter[eligibleFor]=review` only supplies the reviewer selector. A returned user proves that the user may be assigned; it is not an approval and must never be rendered as a queue card. The queue gains a record only after a versioned resource is successfully submitted for review.

## Required frontend changes

### 1. Unwrap the response exactly once

The HTTP response is an envelope and the cursor page is inside `data`:

```ts
export interface ApiEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
  correlationId?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  previousCursor?: string | null;
  total: number;
}

getApprovalQueue(params: HttpParams) {
  return this.http
    .get<ApiEnvelope<CursorPage<ApprovalQueueItem>>>("/api/approvals", { params })
    .pipe(map(response => response.data));
}
```

If a shared interceptor already unwraps `response.data`, the feature service must not unwrap a second time. Confirm this with a service test; double-unwrapping produces `undefined` and commonly looks like an empty screen.

### 2. Keep queue data and reviewer options separate

Use separate state/query keys:

```ts
approvalQueue = signal<ApprovalQueueItem[]>([]);
eligibleReviewers = signal<EligibleReviewer[]>([]);
```

Bind queue cards to `GET /approvals` results and the assignee control to `GET /users?filter[eligibleFor]=review`. Do not combine the responses or use the reviewer count as the queue count.

### 3. Submit an actual saved version

Submitting is a mutation, not a client-side status change. The resource must already have `currentVersionId` and `revision`; otherwise the API returns `409 workflow_version_required` (or the resource-specific equivalent).

| Content type | Submit route | Body |
|---|---|---|
| Theme | `POST /api/themes/:id/submit-review` | `{ "revision": "...", "reviewerUserId": "..." }` |
| Prayer, declaration, sermon, flyer, video | `POST /api/:type/:id/submit-review` | `{ "reviewerUserId": "..." }` |
| Campaign section | `POST /api/campaigns/:id/sections/:scope/submit-review` | `{ "revision": "...", "reviewerUserId": "..." }` |

`reviewerUserId` must be the returned eligible user's `userId`/`id`, not their email, display name, or membership document id. It may be omitted to create an unassigned queue item.

After a successful submit, invalidate both the resource-detail query and the approval-queue query. Do not optimistically manufacture an approval card:

```ts
submitForReview(resourceId: string, reviewerUserId?: string) {
  return this.approvalsApi.submit(resourceId, { reviewerUserId }).pipe(
    tap(() => {
      this.resourceStore.reload(resourceId);
      this.approvalStore.reloadFromFirstPage();
    }),
  );
}
```

### 4. Send only supported filters

The queue accepts `status`, `type`/`resourceType`/`contentType`, `priority`, `assigneeId`/`reviewerUserId`, and `due`/`dueBy` under bracket notation. Examples:

```text
GET /api/approvals?filter[assigneeId]=me
GET /api/approvals?filter[assigneeId]=unassigned
GET /api/approvals?filter[resourceType]=theme&filter[priority]=high
GET /api/approvals?filter[dueBy]=2026-08-31
```

Do not send an empty assignee input as the literal strings `undefined` or `null`. With no assignee filter, the backend intentionally returns unassigned items, items assigned to the current user, and items assigned to other reviewers that the user is permitted to see.

### 5. Render the returned queue contract

Use `id` for approval actions and `resourceId` only for navigation to the underlying content:

```ts
interface ApprovalQueueItem {
  id: string;
  resourceType: string;
  resourceId: string;
  title: string;
  subtitle?: string;
  status: "pending" | "in_review" | "changes_requested";
  priority?: "low" | "normal" | "high" | "urgent";
  dueAt?: string;
  submittedAt?: string;
  requestedByUserId: string;
  requestedByName?: string;
  reviewerUserId?: string;
  reviewerName?: string;
  versionId?: string;
  revision?: string;
  versionLabel?: string;
  preview?: unknown;
}
```

The list endpoint deliberately excludes terminal `approved`, `rejected`, and `cancelled` records. Treat `items: []` as a valid empty state, but only after loading succeeds; keep loading, error, and empty states distinct.

### 6. Wire detail and actions to approval IDs

| Operation | Route | Body |
|---|---|---|
| Detail, comments, timeline | `GET /api/approvals/:approvalId` | — |
| Assign selected reviewer | `POST /api/approvals/:approvalId/assign` | `{ "reviewerUserId": "..." }` |
| Assign to self | `POST /api/approvals/:approvalId/assign` | `{}` |
| Comment | `POST /api/approvals/:approvalId/comments` | `{ "body": "...", "fieldPath"?: "...", "parentCommentId"?: "..." }` |
| Approve | `POST /api/approvals/:approvalId/approve` | `{}` |
| Request changes | `POST /api/approvals/:approvalId/request-changes` | `{ "reason": "..." }` |
| Reject | `POST /api/approvals/:approvalId/reject` | `{ "reason": "..." }` |

After every action, replace/refetch approval detail and invalidate the first queue page. An approved or rejected item should disappear because it is no longer actionable. A `409 approval_version_stale` response must prompt a resource refresh rather than retrying the decision against an outdated preview.

## Diagnostic checklist for the reported empty page

1. In DevTools, verify the queue request is `GET /api/approvals`, not the eligible-users request.
2. Verify the component reads `response.data.items` (or `response.items` only if a shared interceptor unwraps it).
3. Clear all filters and confirm the request does not silently add `filter[assigneeId]=me`.
4. Save/generate a content version, select the eligible reviewer by `userId`, and call its submit-review route.
5. Confirm submit returns a nested `approval.id`; then confirm a new queue request runs instead of reusing a stale cached empty response.
6. If the submit call succeeds but a fresh unfiltered queue remains empty, record both correlation IDs and inspect the persisted approval's `organizationId`, `status`, and resource identifiers on the backend.

## Frontend acceptance tests

- Service test: unwrap `{ data: { items: [...] } }` once and retain the item.
- Component test: render a card from an approval response while using the users response only for the assignee options.
- Component test: show separate loading, error, and valid-empty states.
- Integration test: submit a saved version, assert the queue query is invalidated, and render the returned item.
- Integration test: approve an item and assert it is removed after refetch.
- Integration test: exercise no assignee filter, `me`, and `unassigned` independently.
- End-to-end test: switch organizations and verify approval and eligible-reviewer caches are both cleared before refetch.
