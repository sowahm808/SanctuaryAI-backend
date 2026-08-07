import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrapWorker(): Promise<void> {
  if (process.env.WORKERS_ENABLED !== "true") throw new Error("Worker bootstrap requires WORKERS_ENABLED=true");
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  Logger.log({ event: "worker.ready" }, "WorkerBootstrap");
}
void bootstrapWorker();
