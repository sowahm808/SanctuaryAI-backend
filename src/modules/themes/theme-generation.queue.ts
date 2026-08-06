import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { redisErrorCategory } from "../../config/redis";
import { THEME_GENERATION_JOB, THEME_GENERATION_QUEUE } from "./theme-generation.constants";
import type { ThemeQueuePayload } from "./theme-generation.processor";

@Injectable()
export class ThemeGenerationQueue {
  private readonly logger = new Logger(ThemeGenerationQueue.name);
  constructor(@InjectQueue(THEME_GENERATION_QUEUE) private readonly queue: Queue<ThemeQueuePayload>) {}

  async publish(payload: ThemeQueuePayload): Promise<string> {
    try {
      const job = await this.queue.add(THEME_GENERATION_JOB, payload, {
        jobId: payload.jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      if (!job.id) throw new Error("queue_job_id_missing");
      return job.id;
    } catch (error) {
      this.logger.error({ event: "theme.generation.enqueue_failed", correlationId: payload.correlationId, durableJobId: payload.jobId, queueName: THEME_GENERATION_QUEUE, errorName: error instanceof Error ? error.name : "Error", errorCode: redisErrorCategory(error) }, "Theme generation queue publish failed");
      throw new ServiceUnavailableException({ code: "generation_queue_unavailable", message: "Theme generation cannot be queued right now. Please retry shortly." });
    }
  }

  async readiness(): Promise<{ queue: { status: "up" | "down" } }> {
    try {
      const client = await this.queue.client;
      return { queue: { status: await client.ping() === "PONG" ? "up" : "down" } };
    } catch { return { queue: { status: "down" } }; }
  }
}

export { THEME_GENERATION_JOB, THEME_GENERATION_QUEUE } from "./theme-generation.constants";
