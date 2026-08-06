import type { Queue } from "bullmq";
import type { ThemeQueuePayload } from "../src/modules/themes/theme-generation.processor";
import { ThemeGenerationQueue } from "../src/modules/themes/theme-generation.queue";

describe("queue publication fail-fast boundary", () => {
  it("converts a genuinely pending publication into a safe 503", async () => {
    const originalTimeout = ThemeGenerationQueue.PUBLISH_TIMEOUT_MS;
    Object.defineProperty(ThemeGenerationQueue, "PUBLISH_TIMEOUT_MS", { value: 25, configurable: true });
    const queue = new ThemeGenerationQueue({ add: () => new Promise(() => undefined) } as unknown as Queue<ThemeQueuePayload>);
    const startedAt = Date.now();
    try {
      await expect(queue.publish({ jobId: "job", correlationId: "correlation", organizationId: "org", themeId: "theme", sourceRevision: "revision" })).rejects.toMatchObject({ status: 503, response: { code: "generation_queue_unavailable", detail: "Theme generation cannot be queued right now. Please retry shortly.", correlationId: "correlation", validation: [] } });
      expect(Date.now() - startedAt).toBeLessThan(1_000);
    } finally {
      Object.defineProperty(ThemeGenerationQueue, "PUBLISH_TIMEOUT_MS", { value: originalTimeout, configurable: true });
    }
  });
});
