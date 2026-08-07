import { ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { createRedisProducerConnection, createRedisWorkerConnection } from "../src/config/redis";
import { THEME_GENERATION_JOB, THEME_GENERATION_QUEUE } from "../src/modules/themes/theme-generation.constants";
import type { ThemeQueuePayload } from "../src/modules/themes/theme-generation.processor";
import { ThemeGenerationQueue } from "../src/modules/themes/theme-generation.queue";

const payload: ThemeQueuePayload = { jobId: "job-1", correlationId: "correlation-1", organizationId: "org-1", themeId: "theme-1", sourceRevision: "rev-1" };

describe("Redis configuration", () => {
  it("decodes credentials and enables TLS only for rediss", () => {
    expect(createRedisProducerConnection(" redis://queue-user:p%40ss@redis.example:6380/2 ")).toEqual(expect.objectContaining({ host: "redis.example", port: 6380, username: "queue-user", password: "p@ss", db: 2, maxRetriesPerRequest: 1, enableOfflineQueue: false, tls: undefined }));
    expect(createRedisProducerConnection("rediss://redis.example").tls).toEqual({});
    expect(createRedisWorkerConnection("redis://redis.example")).toEqual(expect.objectContaining({ maxRetriesPerRequest: null, tls: undefined }));
  });
  it.each(["", "http://redis.example", "'redis://redis.example'"])("rejects unsafe REDIS_URL %p", (url) => {
    expect(() => createRedisProducerConnection(url)).toThrow();
  });
});

describe("ThemeGenerationQueue", () => {
  it("publishes the shared BullMQ job and returns its id", async () => {
    const add = jest.fn().mockResolvedValue({ id: "job-1" });
    const waitUntilReady = jest.fn().mockResolvedValue(undefined);
    const producer = new ThemeGenerationQueue({ add, waitUntilReady } as unknown as Queue<ThemeQueuePayload>);
    await expect(producer.publish(payload)).resolves.toBe("job-1");
    expect(add).toHaveBeenCalledWith(THEME_GENERATION_JOB, payload, expect.objectContaining({ jobId: "job-1", attempts: 3 }));
    expect(waitUntilReady).toHaveBeenCalledTimes(1);
    expect(waitUntilReady.mock.invocationCallOrder[0]).toBeLessThan(add.mock.invocationCallOrder[0]);
    expect(THEME_GENERATION_QUEUE).toBe("theme-generation");
  });

  it("waits for a lazy Redis connection before publishing", async () => {
    let markReady!: () => void;
    const waitUntilReady = jest.fn(() => new Promise<void>((resolve) => { markReady = resolve; }));
    const add = jest.fn().mockResolvedValue({ id: "job-1" });
    const producer = new ThemeGenerationQueue({ add, waitUntilReady } as unknown as Queue<ThemeQueuePayload>);

    const publication = producer.publish(payload);
    await Promise.resolve();
    expect(add).not.toHaveBeenCalled();
    markReady();

    await expect(publication).resolves.toBe("job-1");
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("returns only a safe queue error when Redis publication fails", async () => {
    const producer = new ThemeGenerationQueue({ waitUntilReady: jest.fn().mockResolvedValue(undefined), add: jest.fn().mockRejectedValue(new Error("WRONGPASS secret-infrastructure-detail")) } as unknown as Queue<ThemeQueuePayload>);
    const promise = producer.publish(payload);
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toMatchObject({ response: { code: "generation_queue_unavailable", detail: "Theme generation cannot be queued right now. Please retry shortly.", correlationId: "correlation-1", validation: [] } });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    await expect(promise).rejects.not.toMatchObject({ response: expect.objectContaining({ detail: expect.stringContaining("WRONGPASS") }) });
  });

  it("times out a queue publication that never settles", async () => {
    jest.useFakeTimers();
    const producer = new ThemeGenerationQueue({ waitUntilReady: jest.fn().mockResolvedValue(undefined), add: jest.fn(() => new Promise(() => undefined)) } as unknown as Queue<ThemeQueuePayload>);
    const promise = producer.publish(payload);
    // Attach the rejection handler before advancing fake time. Otherwise Node
    // can report the intentional timeout as an unhandled rejection first.
    const rejection = expect(promise).rejects.toMatchObject({ response: { code: "generation_queue_unavailable", correlationId: "correlation-1" } });
    await jest.advanceTimersByTimeAsync(ThemeGenerationQueue.PUBLISH_TIMEOUT_MS);
    await rejection;
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it("reports safe health state", async () => {
    const up = new ThemeGenerationQueue({ waitUntilReady: jest.fn().mockResolvedValue(undefined) } as unknown as Queue<ThemeQueuePayload>);
    await expect(up.readiness()).resolves.toEqual({ queue: { status: "up" } });
    const down = new ThemeGenerationQueue({ waitUntilReady: jest.fn().mockRejectedValue(new Error("redis host secret")) } as unknown as Queue<ThemeQueuePayload>);
    await expect(down.readiness()).resolves.toEqual({ queue: { status: "down" } });
  });
});
