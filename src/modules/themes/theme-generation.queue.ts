import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect as connectTcp, Socket } from "node:net";
import { connect as connectTls, TLSSocket } from "node:tls";
import { ThemeGenerationProcessor, ThemeQueuePayload } from "./theme-generation.processor";

export const THEME_GENERATION_QUEUE = "sanctuaryai:theme-generation";

@Injectable()
export class ThemeGenerationQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThemeGenerationQueue.name);
  private stopped = false;
  private workerStartedAt?: string;

  constructor(private readonly config: ConfigService, private readonly processor: ThemeGenerationProcessor) {}

  onModuleInit(): void {
    if (this.config.get<string>("NODE_ENV") !== "test") {
      this.workerStartedAt = new Date().toISOString();
      void this.consume();
    }
  }

  onModuleDestroy(): void { this.stopped = true; }

  async publish(payload: ThemeQueuePayload): Promise<void> {
    try {
      await this.command("RPUSH", THEME_GENERATION_QUEUE, JSON.stringify(payload));
    } catch {
      this.logger.error({ event: "theme.generation.enqueue_failed", jobId: payload.jobId, correlationId: payload.correlationId }, "Theme generation queue publish failed");
      throw new ServiceUnavailableException({ code: "generation_queue_unavailable", message: "Theme generation cannot be queued right now. Please retry shortly." });
    }
  }

  async readiness(): Promise<{ queue: "up"; worker: "up"; workerStartedAt?: string }> {
    await this.command("PING");
    return { queue: "up", worker: "up", workerStartedAt: this.workerStartedAt };
  }

  private async consume(): Promise<void> {
    while (!this.stopped) {
      try {
        const raw = await this.command("LPOP", THEME_GENERATION_QUEUE);
        if (typeof raw === "string") await this.processor.process(JSON.parse(raw) as ThemeQueuePayload);
        else await new Promise((resolve) => setTimeout(resolve, 750));
      } catch {
        this.logger.error({ event: "theme.generation.worker_unavailable" }, "Theme generation worker queue connection failed");
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  private command(...parts: string[]): Promise<unknown> {
    const redisUrl = new URL(this.config.getOrThrow<string>("REDIS_URL"));
    return new Promise((resolve, reject) => {
      const options = { host: redisUrl.hostname, port: Number(redisUrl.port || (redisUrl.protocol === "rediss:" ? 6380 : 6379)), servername: redisUrl.hostname };
      const socket: Socket | TLSSocket = redisUrl.protocol === "rediss:" ? connectTls(options) : connectTcp(options);
      const commands: string[] = [];
      if (redisUrl.password) commands.push(this.resp("AUTH", decodeURIComponent(redisUrl.password)));
      if (redisUrl.pathname.length > 1) commands.push(this.resp("SELECT", redisUrl.pathname.slice(1)));
      commands.push(this.resp(...parts));
      let index = 0; let buffer = Buffer.alloc(0);
      const timeout = setTimeout(() => socket.destroy(new Error("redis timeout")), 3_000);
      socket.once("error", reject);
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          const frame = this.frame(buffer); if (!frame) return;
          buffer = buffer.subarray(frame.bytes);
          if (frame.error) { clearTimeout(timeout); socket.destroy(); reject(new Error("redis command failed")); return; }
          index += 1;
          if (index === commands.length) { clearTimeout(timeout); socket.end(); resolve(frame.value); return; }
          socket.write(commands[index]);
        }
      });
      socket.once("connect", () => socket.write(commands[0]));
    });
  }

  private resp(...parts: string[]): string { return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`; }
  private frame(data: Buffer): { bytes: number; value?: unknown; error?: boolean } | undefined {
    const lineEnd = data.indexOf("\r\n"); if (lineEnd < 0) return undefined;
    const header = data.subarray(0, lineEnd).toString("utf8");
    if (header[0] === "+" || header[0] === ":" || header[0] === "-") return { bytes: lineEnd + 2, value: header.slice(1), error: header[0] === "-" };
    if (header[0] !== "$") return { bytes: lineEnd + 2, error: true };
    const length = Number(header.slice(1)); if (length === -1) return { bytes: lineEnd + 2, value: null };
    const total = lineEnd + 2 + length + 2; if (data.length < total) return undefined;
    return { bytes: total, value: data.subarray(lineEnd + 2, lineEnd + 2 + length).toString("utf8") };
  }
}

