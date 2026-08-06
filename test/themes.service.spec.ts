import { FirebaseService } from "../src/database/firebase.service";
import { ServiceUnavailableException } from "@nestjs/common";
import { ThemesService } from "../src/modules/themes/themes.service";
import { ThemeGenerationService } from "../src/modules/themes/theme-generation.service";
import { ThemeGenerationQueue } from "../src/modules/themes/theme-generation.queue";

/* Jest method mocks are asserted without invoking the unbound method. */
/* eslint-disable @typescript-eslint/unbound-method */

const identity = { uid: "user-1", emailVerified: true, claims: {} };

describe("ThemesService", () => {
  it("accepts and normalizes the theme workflow brief payload", async () => {
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["themes.write"] }
            : undefined,
      )),
      putDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirebaseService;

    const generator = { generate: jest.fn() } as unknown as ThemeGenerationService;
    const queue = { publish: jest.fn().mockResolvedValue("queue-job-1") } as unknown as ThemeGenerationQueue;
    const result = await new ThemesService(firebase, generator, queue).create(identity, {
      kind: "themes",
      brief: {
        month_and_year: "September 2026",
        topic: "Born to win",
        main_scripture: " Psalm 18:19",
      },
    });

    expect(result.input).toEqual(expect.objectContaining({
      kind: "themes",
      date: "September 2026",
      topic: "Born to win",
      scriptures: ["Psalm 18:19"],
    }));
    expect(firebase.putDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^themes\//),
      result,
    );
  });

  it("durably queues generation without calling the provider in the request", async () => {
    const theme = { id: "theme-1", organizationId: "org-1", revision: "rev-1", input: { topic: "Hope" }, currentOutput: {}, versions: [] };
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(path === "themes/theme-1" ? theme : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["themes.write"] } : undefined)),
      putDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirebaseService;
    const generator = { generate: jest.fn() } as unknown as ThemeGenerationService;
    const queue = { publish: jest.fn().mockResolvedValue("queue-job-1") } as unknown as ThemeGenerationQueue;

    const result = await new ThemesService(firebase, generator, queue).generate(identity, "theme-1");

    expect(result).toEqual(expect.objectContaining({ status: "queued", progress: 0, sourceRevision: "rev-1", cancellationSupported: true }));
    expect(generator.generate).not.toHaveBeenCalled();
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^asyncJobs\//), expect.objectContaining({ status: "queued", progress: 0, queueJobId: "queue-job-1" }));
  });

  it("returns the same generation job for an idempotent retry", async () => {
    const theme = { id: "theme-1", organizationId: "org-1", revision: "rev-1", input: { topic: "Hope" }, currentOutput: {}, versions: [] };
    let savedJob: Record<string, unknown> | undefined;
    const putDocument = jest.fn((path: string, value: Record<string, unknown>) => {
      if (path.startsWith("asyncJobs/")) savedJob = value;
      return Promise.resolve();
    });
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(
        path === "themes/theme-1" ? theme
          : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["themes.write"] }
            : path.startsWith("asyncJobs/") ? savedJob : undefined,
      )),
      putDocument,
    } as unknown as FirebaseService;
    const generator = { generate: jest.fn() } as unknown as ThemeGenerationService;
    const queue = { publish: jest.fn().mockResolvedValue("queue-job-1") } as unknown as ThemeGenerationQueue;
    const service = new ThemesService(firebase, generator, queue);

    const first = await service.generate(identity, "theme-1", {}, "retry-key");
    const second = await service.generate(identity, "theme-1", {}, "retry-key");

    expect(second).toEqual(first);
    expect(putDocument.mock.calls.filter(([path]) => path.startsWith("asyncJobs/"))).toHaveLength(2);
    expect(queue.publish).toHaveBeenCalledTimes(1);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("marks the durable job failed when BullMQ publication fails", async () => {
    const theme = { id: "theme-1", organizationId: "org-1", revision: "rev-1", input: { topic: "Hope" }, currentOutput: {}, versions: [] };
    const writes: Record<string, unknown>[] = [];
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(path === "themes/theme-1" ? theme : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["themes.write"] } : undefined)),
      putDocument: jest.fn((_path: string, value: Record<string, unknown>) => { writes.push(value); return Promise.resolve(); }),
    } as unknown as FirebaseService;
    const queueError = new ServiceUnavailableException({ code: "generation_queue_unavailable", message: "Theme generation cannot be queued right now. Please retry shortly." });
    const queue = { publish: jest.fn().mockRejectedValue(queueError) } as unknown as ThemeGenerationQueue;

    await expect(new ThemesService(firebase, { generate: jest.fn() } as unknown as ThemeGenerationService, queue).generate(identity, "theme-1")).rejects.toBe(queueError);
    expect(writes).toContainEqual(expect.objectContaining({ status: "failed", safeErrorCode: "generation_queue_unavailable" }));
  });
});
