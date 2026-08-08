import { ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
import { TenantRepository } from "../src/database/tenant-repository";
import { ApprovalWorkflowService } from "../src/modules/workflows/approval-workflow.service";
import { ApprovalRepository } from "../src/modules/workflows/approval.repository";
import { WorkflowsService } from "../src/modules/workflows/workflows.service";

/* Jest method mocks are asserted without invoking the unbound method. */
/* eslint-disable @typescript-eslint/unbound-method */

const identity = { uid: "user-1", emailVerified: true, claims: {} };

function firebaseMock(membership: Record<string, unknown>): FirebaseService {
  return {
    getDocument: jest.fn((path: string) =>
      Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? membership
            : undefined,
      ),
    ),
    putDocument: jest.fn().mockResolvedValue(undefined),
    queryDocuments: jest.fn().mockResolvedValue([]),
    queryDocumentsPage: jest.fn().mockResolvedValue({ items: [], nextCursor: null, previousCursor: null, total: 0 }),
  } as unknown as FirebaseService;
}

function workflowsService(firebase: FirebaseService): WorkflowsService {
  return new WorkflowsService(
    firebase,
    new TenantRepository(firebase),
    new ApprovalWorkflowService(firebase),
  );
}

describe("WorkflowsService", () => {
  it("accepts legacy prayers.write permission for prayer creation", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["prayers.write"] });

    const result = await workflowsService(firebase).create(identity, "prayers", {
      kind: "prayer-points",
      brief: { quantity: "20", theme: "financial empowerment" },
    });

    expect(result).toEqual(expect.objectContaining({ organizationId: "org-1", kind: "prayer-points" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^prayers\//),
      expect.objectContaining({ organizationId: "org-1", status: "draft" }),
    );
  });

  it("allows organization administrator roles when workflow permission arrays are stale", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", role: "ChurchAdministrator", permissions: [] });

    const result = await workflowsService(firebase).create(identity, "prayers", {
      kind: "prayer-points",
    });

    expect(result).toEqual(expect.objectContaining({ organizationId: "org-1" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^prayers\//), expect.any(Object));
  });

  it("queues a persisted prayer generation job and timeline event", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["prayers.write"] });
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["prayers.write"] }
            : path === "prayers/prayer-1"
              ? { id: "prayer-1", organizationId: "org-1", revision: "rev-1" }
              : undefined,
      ),
    );

    await expect(workflowsService(firebase).generate(identity, "prayers", "prayer-1", {}))
      .resolves.toEqual(expect.objectContaining({ type: "prayers_generation", status: "queued" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^asyncJobs\//), expect.objectContaining({ status: "queued" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^workflowEvents\//), expect.objectContaining({ action: "generation_queued", resourceId: "prayer-1" }));
  });

  it("accepts numeric revisions from legacy declaration records", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["declarations.write"] });
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["declarations.write"] }
            : path === "declarations/declaration-1"
              ? { id: "declaration-1", organizationId: "org-1", revision: 3, versions: [] }
              : undefined,
      ),
    );

    await expect(workflowsService(firebase).patch(identity, "declarations", "declaration-1", {
      expectedRevision: "3",
      title: "Updated declaration",
    })).resolves.toEqual(expect.objectContaining({ title: "Updated declaration" }));
  });

  it.each(["prayers", "declarations"])("returns empty secondary metadata for an existing %s resource", async (area) => {
    const firebase = firebaseMock({ status: "ACTIVE", role: "ChurchAdministrator", permissions: [] });
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) => Promise.resolve(
      path === "users/user-1" ? { activeOrganizationId: "org-1" }
        : path === "memberships/org-1_user-1" ? { status: "ACTIVE", role: "ChurchAdministrator", permissions: [] }
          : path === `${area}/resource-1` ? { id: "resource-1", organizationId: "org-1", revision: "rev-1", versions: [] }
            : undefined,
    ));
    const service = workflowsService(firebase);
    await expect(service.versions(identity, area, "resource-1")).resolves.toEqual({ items: [] });
    await expect(service.timeline(identity, area, "resource-1")).resolves.toEqual({ items: [] });
    await expect(service.approval(identity, area, "resource-1")).resolves.toBeNull();
  });

  it("still rejects active members without matching workflow permissions", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["themes.write"] });

    await expect(workflowsService(firebase).create(identity, "prayers", { kind: "prayer-points" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reads approvals with the legacy approval reviewer permission", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["approvals.review"] });
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["approvals.review"] }
            : path === "approvals/approval-1"
              ? { id: "approval-1", organizationId: "org-1", status: "pending" }
              : undefined,
      ),
    );

    await expect(workflowsService(firebase).get(identity, "approvals", "approval-1"))
      .resolves.toEqual(expect.objectContaining({ id: "approval-1", status: "pending" }));
    expect(firebase.getDocument).toHaveBeenCalledWith("approvals/approval-1");
  });

  it("accepts users as a workflow list area for reviewer selectors", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["team.read"] });

    await expect(workflowsService(firebase).list(identity, "users"))
      .resolves.toEqual({ items: [], nextCursor: null, previousCursor: null, total: 0 });
  });

  it("returns hydrated unassigned and assigned-to-me actionable approvals", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["approvals.review"] });
    (firebase.queryDocumentsPage as jest.Mock).mockResolvedValue({
      items: [
        { id: "a-1", organizationId: "org-1", contentType: "prayers", contentId: "p-1", status: "PENDING_APPROVAL", requestedBy: "author-1", versionId: "v-1", revision: "3", updatedAt: "2026-01-01" },
        { id: "a-2", organizationId: "org-1", resourceType: "declarations", resourceId: "d-1", status: "in_review", requestedByUserId: "author-1", reviewerUserId: "user-1", versionId: "v-2", revision: "2", updatedAt: "2026-01-02" },
        { id: "a-3", organizationId: "org-1", resourceType: "prayers", resourceId: "p-2", status: "APPROVED", requestedByUserId: "author-1", updatedAt: "2026-01-03" },
      ], nextCursor: null, previousCursor: null, total: 3,
    });
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) => Promise.resolve(
      path === "users/user-1" ? { id: "user-1", activeOrganizationId: "org-1" }
        : path === "users/author-1" ? { displayName: "Michael Author" }
          : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["approvals.review"] }
            : path === "prayers/p-1" ? { id: "p-1", title: "Morning Prayer", currentVersionId: "v-1", versions: [{ id: "v-1", snapshot: { title: "Morning Prayer", prayerPoints: ["Grace"] } }] }
              : path === "declarations/d-1" ? { id: "d-1", title: "August Declaration", currentVersionId: "v-2", versions: [{ id: "v-2", snapshot: { declaration: "I will flourish" } }] }
                : undefined,
    ));

    const result = await workflowsService(firebase).list(identity, "approvals", { limit: 20, sort: "updatedAt", direction: "desc", filter: {} });

    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a-1", title: "Morning Prayer", status: "pending", requestedByName: "Michael Author", preview: { title: "Morning Prayer", prayerPoints: ["Grace"] } }),
      expect.objectContaining({ id: "a-2", title: "August Declaration", status: "in_review", reviewerUserId: "user-1" }),
    ]));
  });

  it("includes legacy pending approval statuses when the production repository is injected", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["approvals.review"] });
    (firebase.queryDocuments as jest.Mock).mockResolvedValue([
      { id: "legacy-1", organizationId: "org-1", resourceType: "themes", resourceId: "theme-1", status: "PENDING_APPROVAL", requestedByUserId: "author-1", updatedAt: "2026-01-01" },
    ]);
    (firebase.getDocument as jest.Mock).mockImplementation((path: string) => Promise.resolve(
      path === "users/user-1" ? { id: "user-1", activeOrganizationId: "org-1" }
        : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["approvals.review"] }
          : path === "themes/theme-1" ? { id: "theme-1", title: "Legacy theme" }
            : undefined,
    ));
    const repository = new ApprovalRepository(firebase);
    const service = new WorkflowsService(firebase, new TenantRepository(firebase), new ApprovalWorkflowService(firebase, repository), repository);

    await expect(service.list(identity, "approvals", { limit: 20, sort: "updatedAt", direction: "desc", filter: {} }))
      .resolves.toEqual(expect.objectContaining({ items: [expect.objectContaining({ id: "legacy-1", status: "pending", title: "Legacy theme" })], total: 1 }));
  });

  it("applies real assignee filters without hiding unassigned approvals by default", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["approvals.review"] });
    (firebase.queryDocumentsPage as jest.Mock).mockResolvedValue({ items: [
      { id: "mine", organizationId: "org-1", resourceType: "prayers", resourceId: "p-1", status: "pending", reviewerUserId: "user-1", updatedAt: "1" },
      { id: "open", organizationId: "org-1", resourceType: "prayers", resourceId: "p-2", status: "pending", updatedAt: "2" },
      { id: "other", organizationId: "org-1", resourceType: "prayers", resourceId: "p-3", status: "pending", reviewerUserId: "user-2", updatedAt: "3" },
    ], nextCursor: null, previousCursor: null, total: 3 });
    const service = workflowsService(firebase);
    await expect(service.list(identity, "approvals", { limit: 20, sort: "updatedAt", direction: "desc", filter: { assigneeId: "me" } })).resolves.toEqual(expect.objectContaining({ items: [expect.objectContaining({ id: "mine" })] }));
    await expect(service.list(identity, "approvals", { limit: 20, sort: "updatedAt", direction: "desc", filter: { assigneeId: "unassigned" } })).resolves.toEqual(expect.objectContaining({ items: [expect.objectContaining({ id: "open" })] }));
  });
});
