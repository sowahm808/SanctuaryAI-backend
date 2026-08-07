import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FirebaseService } from "../src/database/firebase.service";
import { DashboardSummaryRepository } from "../src/modules/dashboard/dashboard-summary.repository";

describe("DashboardSummaryRepository", () => {
  afterEach(() => jest.restoreAllMocks());

  it("translates Firestore NOT_FOUND to null without error-level logging", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: 404, status: "NOT_FOUND", message: "Document not found." },
    }), { status: 404, headers: { "content-type": "application/json" } }));
    const errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const debugLog = jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    const config = { get: jest.fn((key: string) => key === "FIRESTORE_EMULATOR_HOST" ? "localhost:8080" : undefined), getOrThrow: jest.fn(() => "project") } as unknown as ConfigService;
    const repository = new DashboardSummaryRepository(new FirebaseService(config));

    await expect(repository.findByOrganizationId("org-a")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("dashboardSummaries/org-a"), expect.any(Object));
    expect(errorLog).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith({ event: "dashboard_summary.missing", organizationId: "org-a" });
  });
});
