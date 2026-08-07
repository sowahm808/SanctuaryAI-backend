import { ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
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
  } as unknown as FirebaseService;
}

describe("WorkflowsService", () => {
  it("accepts legacy prayers.write permission for prayer creation", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["prayers.write"] });

    const result = await new WorkflowsService(firebase).create(identity, "prayers", {
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

    const result = await new WorkflowsService(firebase).create(identity, "prayers", {
      kind: "prayer-points",
    });

    expect(result).toEqual(expect.objectContaining({ organizationId: "org-1" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^prayers\//), expect.any(Object));
  });

  it("queues prayer generation jobs with the current revision", async () => {
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

    const result = await new WorkflowsService(firebase).generate(identity, "prayers", "prayer-1", {});

    expect(result).toEqual(expect.objectContaining({ organizationId: "org-1", type: "prayers_generate", status: "queued", sourceRevision: "rev-1" }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^asyncJobs\//), expect.any(Object));
    const putDocument = firebase.putDocument as jest.Mock<Promise<void>, [string, Record<string, unknown>]>;
    const jobWrite = putDocument.mock.calls.find(([path]) => path.startsWith("asyncJobs/"));
    expect(jobWrite?.[1]).toEqual(expect.objectContaining({ payload: { id: "prayer-1", sourceRevision: "rev-1" } }));
  });

  it("still rejects active members without matching workflow permissions", async () => {
    const firebase = firebaseMock({ status: "ACTIVE", permissions: ["themes.write"] });

    await expect(new WorkflowsService(firebase).create(identity, "prayers", { kind: "prayer-points" })).rejects.toBeInstanceOf(ForbiddenException);
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

    await expect(new WorkflowsService(firebase).get(identity, "approvals", "approval-1"))
      .resolves.toEqual(expect.objectContaining({ id: "approval-1", status: "pending" }));
    expect(firebase.getDocument).toHaveBeenCalledWith("approvals/approval-1");
  });
});
