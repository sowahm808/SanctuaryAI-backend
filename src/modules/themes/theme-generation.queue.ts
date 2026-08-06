import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { withTimeout } from "../../common/with-timeout";
import { redisErrorCategory, sanitizedRedisErrorMessage } from "../../config/redis";
import {
  THEME_GENERATION_JOB,
  THEME_GENERATION_QUEUE,
} from "./theme-generation.constants";
import type { ThemeQueuePayload } from "./theme-generation.processor";

export const THEME_GENERATION_PRODUCER = Symbol("THEME_GENERATION_PRODUCER");

@Injectable()
export class ThemeGenerationQueue implements OnModuleDestroy {
  private readonly logger = new Logger(ThemeGenerationQueue.name);
  static readonly PUBLISH_TIMEOUT_MS: number = 10_000;
  static readonly READINESS_TIMEOUT_MS = 5_000;

  constructor(
    @Inject(THEME_GENERATION_PRODUCER)
    private readonly queue: Queue<ThemeQueuePayload>,
  ) {}

  async onModuleDestroy(): Promise<void> { await this.queue.close(); }

  async publish(payload: ThemeQueuePayload): Promise<string> {
    const startedAt = Date.now();
    this.logger.log({ event: "theme.generation.queue_publish_started", correlationId: payload.correlationId, durableJobId: payload.jobId, queueName: THEME_GENERATION_QUEUE, timeoutMs: ThemeGenerationQueue.PUBLISH_TIMEOUT_MS }, "Publishing theme generation job");
    try {
      // The producer disables ioredis offline queueing so a command issued while
      // the connection is still being established fails immediately. BullMQ
      // connections are lazy, which made the first generation request after a
      // deploy intermittently return 503 even when Redis was healthy. Wait for
      // the connection inside the existing hard deadline before publishing.
      const job = await withTimeout((async () => {
        await this.queue.waitUntilReady();
        return this.queue.add(
          THEME_GENERATION_JOB,
          payload,
          {
            jobId: payload.jobId,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5_000,
            },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
      })(), ThemeGenerationQueue.PUBLISH_TIMEOUT_MS, "queue_publish_timeout");

      if (!job.id) {
        throw new Error("queue_job_id_missing");
      }

      this.logger.log({ event: "theme.generation.queued", correlationId: payload.correlationId, durableJobId: payload.jobId, queueJobId: job.id, queueName: THEME_GENERATION_QUEUE, elapsedMs: Date.now() - startedAt }, "Theme generation queued");
      return job.id;
    } catch (error) {
      const errorCode = redisErrorCategory(error);
      this.logger.error(
        {
          event: "theme.generation.enqueue_failed",
          correlationId: payload.correlationId,
          durableJobId: payload.jobId,
          queueName: THEME_GENERATION_QUEUE,
          elapsedMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : "Error",
          errorCode,
          sanitizedErrorMessage: sanitizedRedisErrorMessage(errorCode),
        },
        "Theme generation queue publish failed",
      );

      throw new ServiceUnavailableException({
        code: "generation_queue_unavailable",
        detail:
          "Theme generation cannot be queued right now. Please retry shortly.",
        correlationId: payload.correlationId,
        validation: [],
      });
    }
  }

  async readiness(): Promise<{
    queue: {
      status: "up" | "down";
    };
  }> {
    try {
      await withTimeout(this.queue.waitUntilReady(), ThemeGenerationQueue.READINESS_TIMEOUT_MS, "queue_readiness_timeout");

      return {
        queue: {
          status: "up",
        },
      };
    } catch (error) {
      this.logger.warn(
        {
          event: "theme.generation.queue_readiness_failed",
          queueName: THEME_GENERATION_QUEUE,
          errorName: error instanceof Error ? error.name : "Error",
          errorCode: redisErrorCategory(error),
        },
        "Theme generation queue readiness check failed",
      );

      return {
        queue: {
          status: "down",
        },
      };
    }
  }
}

export {
  THEME_GENERATION_JOB,
  THEME_GENERATION_QUEUE,
} from "./theme-generation.constants";
