import { ForbiddenException } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";

const identity = { uid: "user-1", emailVerified: true, claims: {} };

function service(docs: Record<string, Record<string, unknown> | undefined>) {
  return new DashboardService({ getDocument: jest.fn((path: string) => Promise.resolve(docs[path])) } as unknown as FirebaseService);
}

describe("DashboardService", () => {
  it("scopes summaries to the active organization and sanitizes dashboard URLs and counts", async () => {
    const result = await service({
      "users/user-1": { activeOrganizationId: "org-a" },
      "memberships/org-a_user-1": { status: "ACTIVE", permissions: ["themes.read"] },
      "dashboardSummaries/org-a": {
        generatedAt: "2026-08-04T12:00:00Z",
        metrics: [{ kind: "review", label: "Awaiting review", value: -4, severity: "warning" }],
        workItems: [{ id: "ser_1", title: "Draft", href: "https://evil.example", category: "draft_sermon", updatedAt: "2026-08-04T11:00:00Z" }],
        channels: [],
        publishingFailures: [{ id: "pub_1", title: "Post", recoveryHref: "https://evil.example", failedAt: "2026-08-04T11:30:00Z" }],
      },
    }).summary(identity);

    expect(result.summary.metrics).toEqual([expect.objectContaining({ value: 0, severity: "warning" })]);
    expect(result.summary.workItems).toEqual([expect.objectContaining({ href: "/app/dashboard", category: "draft_sermon" })]);
    expect(result.summary.publishingFailures).toEqual([expect.objectContaining({ recoveryHref: "/app/publishing" })]);
    expect(result.etag).toMatch(/^W\//);
  });

  it("rejects inactive or missing memberships immediately", async () => {
    await expect(service({ "users/user-1": { activeOrganizationId: "org-a" }, "memberships/org-a_user-1": { status: "REVOKED", permissions: ["themes.read"] } }).summary(identity)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
