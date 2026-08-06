import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { FirebaseService } from "../../database/firebase.service";
import { ThemeGenerationError, ThemeGenerationService } from "./theme-generation.service";

type R = Record<string, unknown>;
export interface ThemeQueuePayload { jobId: string; correlationId: string; organizationId: string; themeId: string; sourceRevision: string; }

@Injectable()
export class ThemeGenerationProcessor {
  private readonly logger = new Logger(ThemeGenerationProcessor.name);
  constructor(private readonly firebase: FirebaseService, private readonly provider: ThemeGenerationService, private readonly config: ConfigService) {}

  async process(payload: ThemeQueuePayload): Promise<void> {
    const job = await this.firebase.getDocument(`asyncJobs/${payload.jobId}`);
    if (!job || !["queued", "processing"].includes(this.s(job.status))) return;
    const now = new Date().toISOString();
    const running = { ...job, status: "running", progress: 5, message: "Preparing theme generation", startedAt: now, updatedAt: now, leaseOwner: randomUUID(), leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(), attemptCount: Number(job.attemptCount) + 1 };
    await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, running);
    this.logger.log({ event: "theme.generation.started", ...payload }, "Theme generation started");
    try {
      const theme = await this.firebase.getDocument(`themes/${payload.themeId}`);
      if (!theme || this.s(theme.organizationId) !== payload.organizationId) throw new ThemeGenerationError("theme_source_unavailable", "The source theme is no longer available.", false);
      await this.progress(running, 15, "Building generation request");
      await this.progress(running, 30, "Generating theme");
      const result = await this.provider.generate((theme.input as R) ?? {}, (theme.currentOutput as R) ?? {}, this.s((job.payload as R)?.scope), { ...payload, attempt: Number(running.attemptCount) });
      await this.progress(running, 75, "Validating generated theme");
      const currentJob = await this.firebase.getDocument(`asyncJobs/${payload.jobId}`);
      if (["cancelled", "cancelling"].includes(this.s(currentJob?.status))) { await this.cancel(currentJob ?? running); return; }
      await this.progress(running, 90, "Saving theme candidate");
      const latest = await this.firebase.getDocument(`themes/${payload.themeId}`) ?? theme;
      const candidate = { id: randomUUID(), sourceRevision: payload.sourceRevision, generatedByJobId: payload.jobId, generatedAt: new Date().toISOString(), status: "candidate", basedOnOlderRevision: this.s(latest.revision) !== payload.sourceRevision, output: result };
      await this.firebase.putDocument(`themes/${payload.themeId}`, { ...latest, versions: this.arr(latest.versions).concat(candidate), updatedAt: new Date().toISOString() });
      const completedAt = new Date().toISOString();
      await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "completed", progress: 100, message: "Theme generation completed", retryable: false, completedAt, updatedAt: completedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId });
      this.logger.log({ event: "theme.generation.completed", ...payload }, "Theme generation completed");
    } catch (error) {
      const classified = error instanceof ThemeGenerationError ? error : new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
      const failedAt = new Date().toISOString();
      await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "failed", message: classified.safeDetail, retryable: classified.retryable, safeErrorCode: classified.safeCode, safeErrorDetail: classified.safeDetail, failedAt, updatedAt: failedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId });
      this.logger.error({ event: "theme.generation.failed", ...payload, safeErrorCategory: classified.safeCode, retryable: classified.retryable }, "Theme generation failed");
    }
  }
  private async progress(job: R, progress: number, message: string) { await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "running", progress, message, updatedAt: new Date().toISOString() }); }
  private async cancel(job: R) { const now = new Date().toISOString(); await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "cancelled", message: "Theme generation cancelled", cancelledAt: now, updatedAt: now }); }
  private s(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
  private arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
}
