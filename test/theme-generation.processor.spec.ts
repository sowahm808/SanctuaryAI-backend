import type { Job } from "bullmq";
import { FirebaseService } from "../src/database/firebase.service";
import { THEME_GENERATION_JOB } from "../src/modules/themes/theme-generation.constants";
import { ThemeGenerationProcessor, ThemeQueuePayload } from "../src/modules/themes/theme-generation.processor";
import { ThemeGenerationError, ThemeGenerationService } from "../src/modules/themes/theme-generation.service";

describe("ThemeGenerationProcessor provider failure persistence", () => {
  const payload: ThemeQueuePayload = { jobId: "job-1", correlationId: "correlation-1", organizationId: "org-1", themeId: "theme-1", sourceRevision: "revision-1" };

  it.each([
    ["ai_provider_quota_exhausted", false],
    ["ai_provider_rate_limited", true],
  ])("preserves %s and retryable=%s", async (safeCode, retryable) => {
    const durable = { id: "job-1", status: "queued", organizationId: "org-1", themeId: "theme-1", sourceRevision: "revision-1", correlationId: "correlation-1", payload: {} };
    const theme = { organizationId: "org-1", revision: "revision-1", input: {}, currentOutput: {}, locks: [], approvalState: "draft" };
    const getDocument = jest.fn().mockResolvedValueOnce(durable).mockResolvedValueOnce(theme);
    const putDocument = jest.fn().mockResolvedValue(undefined);
    const firebase = { getDocument, putDocument } as unknown as FirebaseService;
    const error = new ThemeGenerationError(safeCode, "Safe provider detail", retryable);
    const provider = { generate: jest.fn().mockRejectedValue(error) } as unknown as ThemeGenerationService;
    const queueJob = {
      name: THEME_GENERATION_JOB, data: payload, id: "queue-1", attemptsMade: 2, opts: { attempts: 3 }, updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ThemeQueuePayload>;

    await expect(new ThemeGenerationProcessor(firebase, provider).process(queueJob)).rejects.toBe(error);
    expect(putDocument).toHaveBeenLastCalledWith("asyncJobs/job-1", expect.objectContaining({
      status: "failed", safeErrorCode: safeCode, safeErrorDetail: "Safe provider detail", retryable, attemptCount: 3, correlationId: "correlation-1",
    }));
  });
});
