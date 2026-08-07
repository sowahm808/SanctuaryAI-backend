import { ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { DashboardSummaryRepository } from "../src/modules/dashboard/dashboard-summary.repository";

const identity = { uid: "user-1", emailVerified: true, claims: {} };

function service(docs: Record<string, Record<string, unknown> | undefined>) {
  const firebase = { getDocument: jest.fn((path: string) => Promise.resolve(docs[path])) } as unknown as FirebaseService;
  const findSummary = jest.fn((organizationId: string) => Promise.resolve(docs[`dashboardSummaries/${organizationId}`] ?? null));
  const summaries = {
    findByOrganizationId: findSummary,
  } as unknown as DashboardSummaryRepository;
  return { dashboard: new DashboardService(firebase, summaries), firebase, findSummary };
}

describe("DashboardService", () => {
  it("scopes summaries to the active organization and sanitizes dashboard URLs and counts", async () => {
    const fixture = service({
      "users/user-1": { activeOrganizationId: "org-a" },
      "memberships/org-a_user-1": { status: "ACTIVE", permissions: ["themes.read"] },
      "dashboardSummaries/org-a": {
        generatedAt: "2026-08-04T12:00:00Z",
        metrics: [{ kind: "review", label: "Awaiting review", value: -4, severity: "warning" }],
        workItems: [{ id: "ser_1", title: "Draft", href: "https://evil.example", category: "draft_sermon", updatedAt: "2026-08-04T11:00:00Z" }],
        channels: [],
        publishingFailures: [{ id: "pub_1", title: "Post", recoveryHref: "https://evil.example", failedAt: "2026-08-04T11:30:00Z" }],
      },
    });
    const result = await fixture.dashboard.summary(identity);

    expect(result.summary.metrics).toEqual([expect.objectContaining({ value: 0, severity: "warning" })]);
    expect(result.summary.workItems).toEqual([expect.objectContaining({ href: "/app/dashboard", category: "draft_sermon" })]);
    expect(result.summary.publishingFailures).toEqual([expect.objectContaining({ recoveryHref: "/app/publishing" })]);
    expect(result.etag).toMatch(/^W\//);
    expect(fixture.findSummary).toHaveBeenCalledWith("org-a");
  });

  it("returns the exact safe contract when the optional cached summary is missing", async () => {
    const result = await service({
      "users/user-1": { activeOrganizationId: "org-a" },
      "memberships/org-a_user-1": { status: "ACTIVE", permissions: ["themes.read"] },
    }).dashboard.summary(identity);

    expect(typeof result.summary.generatedAt).toBe("string");
    expect(result.summary).toEqual({
      generatedAt: result.summary.generatedAt, stale: false, metrics: [], workItems: [], channels: [],
      sectionIssues: [], scheduledPosts: [], publishingFailures: [], recentContent: [],
      quickActions: [], aiUsage: null,
    });
  });

  it("never reads a summary for an organization other than the authenticated user's active tenant", async () => {
    const fixture = service({
      "users/user-1": { activeOrganizationId: "org-a" },
      "memberships/org-a_user-1": { status: "ACTIVE", permissions: ["themes.read"] },
      "dashboardSummaries/org-a": { metrics: [{ kind: "safe", value: 1 }] },
      "dashboardSummaries/org-b": { metrics: [{ kind: "secret", value: 99 }] },
    });
    const result = await fixture.dashboard.summary(identity);

    expect(fixture.findSummary).toHaveBeenCalledTimes(1);
    expect(fixture.findSummary).toHaveBeenCalledWith("org-a");
    expect(result.summary.metrics).toEqual([expect.objectContaining({ kind: "safe", value: 1 })]);
  });

  it("rejects inactive or missing memberships immediately", async () => {
    await expect(service({ "users/user-1": { activeOrganizationId: "org-a" }, "memberships/org-a_user-1": { status: "REVOKED", permissions: ["themes.read"] } }).dashboard.summary(identity)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
