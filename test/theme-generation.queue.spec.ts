import { ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { createRedisConnection } from "../src/config/redis";
import { THEME_GENERATION_JOB, THEME_GENERATION_QUEUE } from "../src/modules/themes/theme-generation.constants";
import type { ThemeQueuePayload } from "../src/modules/themes/theme-generation.processor";
import { ThemeGenerationQueue } from "../src/modules/themes/theme-generation.queue";

const payload: ThemeQueuePayload = { jobId: "job-1", correlationId: "correlation-1", organizationId: "org-1", themeId: "theme-1", sourceRevision: "rev-1" };

describe("Redis configuration", () => {
  it("decodes credentials and enables TLS only for rediss", () => {
    expect(createRedisConnection(" redis://queue-user:p%40ss@redis.example:6380/2 ")).toEqual(expect.objectContaining({ host: "redis.example", port: 6380, username: "queue-user", password: "p@ss", db: 2, maxRetriesPerRequest: null, tls: undefined }));
    expect(createRedisConnection("rediss://redis.example").tls).toEqual({});
  });
  it.each(["", "http://redis.example", "'redis://redis.example'"])("rejects unsafe REDIS_URL %p", (url) => {
    expect(() => createRedisConnection(url)).toThrow();
  });
});

describe("ThemeGenerationQueue", () => {
  it("publishes the shared BullMQ job and returns its id", async () => {
    const add = jest.fn().mockResolvedValue({ id: "job-1" });
    const producer = new ThemeGenerationQueue({ add } as unknown as Queue<ThemeQueuePayload>);
    await expect(producer.publish(payload)).resolves.toBe("job-1");
    expect(add).toHaveBeenCalledWith(THEME_GENERATION_JOB, payload, expect.objectContaining({ jobId: "job-1", attempts: 3 }));
    expect(THEME_GENERATION_QUEUE).toBe("theme-generation");
  });

  it("returns only a safe queue error when Redis publication fails", async () => {
    const producer = new ThemeGenerationQueue({ add: jest.fn().mockRejectedValue(new Error("WRONGPASS secret-infrastructure-detail")) } as unknown as Queue<ThemeQueuePayload>);
    const promise = producer.publish(payload);
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toMatchObject({ response: { code: "generation_queue_unavailable", message: "Theme generation cannot be queued right now. Please retry shortly." } });
  });

  it("reports safe health state", async () => {
    const up = new ThemeGenerationQueue({ client: Promise.resolve({ ping: jest.fn().mockResolvedValue("PONG") }) } as unknown as Queue<ThemeQueuePayload>);
    await expect(up.readiness()).resolves.toEqual({ queue: { status: "up" } });
    const down = new ThemeGenerationQueue({ client: Promise.reject(new Error("redis host secret")) } as unknown as Queue<ThemeQueuePayload>);
    await expect(down.readiness()).resolves.toEqual({ queue: { status: "down" } });
  });
});
