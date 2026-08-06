import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { FirebaseService } from "../../database/firebase.service";
import { THEME_GENERATION_JOB, THEME_GENERATION_QUEUE } from "./theme-generation.constants";
import { ThemeGenerationError, ThemeGenerationService } from "./theme-generation.service";

type R = Record<string, unknown>;
export interface ThemeQueuePayload { jobId: string; correlationId: string; organizationId: string; themeId: string; sourceRevision: string; }

@Processor(THEME_GENERATION_QUEUE)
export class ThemeGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ThemeGenerationProcessor.name);
  constructor(private readonly firebase: FirebaseService, private readonly provider: ThemeGenerationService) { super(); }

  async process(queueJob: Job<ThemeQueuePayload>): Promise<void> {
    if (queueJob.name !== THEME_GENERATION_JOB) throw new Error("unsupported_theme_generation_job");
    const payload = queueJob.data;
    const durable = await this.firebase.getDocument(`asyncJobs/${payload.jobId}`);
    if (!durable || ["completed", "failed", "cancelled"].includes(this.s(durable.status))) return;
    if (!this.matches(durable, payload)) throw new Error("theme_generation_payload_mismatch");
    if (["cancelling"].includes(this.s(durable.status))) { await this.cancel(durable); return; }

    const now = new Date().toISOString();
    const running = { ...durable, status: "running", progress: 5, message: "Preparing theme generation", startedAt: this.s(durable.startedAt) || now, updatedAt: now, leaseOwner: String(queueJob.id), leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(), attemptCount: queueJob.attemptsMade + 1, correlationId: payload.correlationId };
    await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, running);
    await queueJob.updateProgress(5);
    this.logger.log({ event: "theme.generation.started", correlationId: payload.correlationId, durableJobId: payload.jobId, queueJobId: queueJob.id, queueName: THEME_GENERATION_QUEUE }, "Theme generation started");
    try {
      const theme = await this.firebase.getDocument(`themes/${payload.themeId}`);
      if (!theme || this.s(theme.organizationId) !== payload.organizationId || this.s(theme.revision) !== payload.sourceRevision) throw new ThemeGenerationError("theme_source_unavailable", "The source theme revision is no longer available.", false);
      if (this.arr(theme.locks).length || ["approve", "approved", "published"].includes(this.s(theme.approvalState))) throw new ThemeGenerationError("theme_locked", "The theme is locked and was not changed.", false);
      await this.progress(queueJob, running, 15, "Building generation request");
      await this.progress(queueJob, running, 30, "Generating theme");
      const result = await this.provider.generate((theme.input as R) ?? {}, (theme.currentOutput as R) ?? {}, this.s((durable.payload as R)?.scope), { ...payload, attempt: queueJob.attemptsMade + 1 });
      await this.progress(queueJob, running, 75, "Validating generated theme");
      const currentJob = await this.firebase.getDocument(`asyncJobs/${payload.jobId}`);
      if (["cancelled", "cancelling"].includes(this.s(currentJob?.status))) { await this.cancel(currentJob ?? running); return; }
      await this.progress(queueJob, running, 90, "Saving theme candidate");
      const latest = await this.firebase.getDocument(`themes/${payload.themeId}`) ?? theme;
      if (this.arr(latest.locks).length || ["approve", "approved", "published"].includes(this.s(latest.approvalState))) throw new ThemeGenerationError("theme_locked", "The theme is locked and was not changed.", false);
      if (this.arr(latest.versions).some((version) => this.s((version as R).generatedByJobId) === payload.jobId)) return await this.complete(queueJob, running, payload);
      const candidate = { id: randomUUID(), sourceRevision: payload.sourceRevision, generatedByJobId: payload.jobId, generatedAt: new Date().toISOString(), status: "candidate", basedOnOlderRevision: this.s(latest.revision) !== payload.sourceRevision, output: result };
      await this.firebase.putDocument(`themes/${payload.themeId}`, { ...latest, versions: this.arr(latest.versions).concat(candidate), updatedAt: new Date().toISOString() });
      await this.complete(queueJob, running, payload);
    } catch (error) {
      const classified = error instanceof ThemeGenerationError ? error : new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
      const attempts = Number(queueJob.opts.attempts ?? 1);
      if (!classified.retryable || queueJob.attemptsMade + 1 >= attempts) {
        const failedAt = new Date().toISOString();
        await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "failed", message: classified.safeDetail, retryable: classified.retryable, safeErrorCode: classified.safeCode, safeErrorDetail: classified.safeDetail, failedAt, updatedAt: failedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId, attemptCount: queueJob.attemptsMade + 1 });
      } else {
        await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "queued", progress: 0, message: "Queued for retry", updatedAt: new Date().toISOString(), leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId, attemptCount: queueJob.attemptsMade + 1 });
      }
      this.logger.error({ event: "theme.generation.failed", correlationId: payload.correlationId, durableJobId: payload.jobId, queueJobId: queueJob.id, queueName: THEME_GENERATION_QUEUE, safeErrorCategory: classified.safeCode, retryable: classified.retryable, attempt: queueJob.attemptsMade + 1 }, "Theme generation failed");
      throw classified;
    }
  }
  private async progress(queueJob: Job<ThemeQueuePayload>, job: R, progress: number, message: string) { await queueJob.updateProgress(progress); await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "running", progress, message, updatedAt: new Date().toISOString() }); }
  private async complete(queueJob: Job<ThemeQueuePayload>, running: R, payload: ThemeQueuePayload) { await queueJob.updateProgress(100); const completedAt = new Date().toISOString(); await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "completed", progress: 100, message: "Theme generation completed", retryable: false, completedAt, updatedAt: completedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId }); }
  private async cancel(job: R) { const now = new Date().toISOString(); await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "cancelled", message: "Theme generation cancelled", cancelledAt: now, updatedAt: now }); }
  private matches(job: R, payload: ThemeQueuePayload) { return this.s(job.organizationId) === payload.organizationId && this.s(job.themeId) === payload.themeId && this.s(job.sourceRevision) === payload.sourceRevision && this.s(job.correlationId) === payload.correlationId; }
  private s(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
  private arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
}
