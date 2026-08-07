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
    await this.event(running, payload, "theme.generation_started", "Theme generation started");
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
      const versionId = randomUUID(), revision = this.nextRevision(latest.revision), createdAt = new Date().toISOString();
      const candidate = { id: versionId, themeId: payload.themeId, organizationId: payload.organizationId, revision, sourceRevision: payload.sourceRevision, generatedByJobId: payload.jobId, createdAt, createdBy: this.s(durable.createdBy), status: "version_ready", basedOnOlderRevision: this.s(latest.revision) !== payload.sourceRevision, output: result };
      await this.firebase.putDocument(`themes/${payload.themeId}/versions/${versionId}`, candidate);
      await this.firebase.putDocument(`themes/${payload.themeId}`, { ...latest, currentOutput: result, currentVersionId: versionId, revision, status: "version_ready", approvalState: "version_ready", updatedAt: createdAt });
      await this.event(running, payload, "theme.version_created", `Theme version ${String(revision)} created`, versionId, revision);
      await this.event(running, payload, "theme.generation_completed", "Theme generation completed", versionId, revision);
      await this.complete(queueJob, running, payload, { contentId: payload.themeId, versionId, revision });
    } catch (error) {
      const classified = error instanceof ThemeGenerationError ? error : new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
      const attempts = Number(queueJob.opts.attempts ?? 1);
      if (!classified.retryable || queueJob.attemptsMade + 1 >= attempts) {
        const failedAt = new Date().toISOString();
        await this.event(running, payload, "theme.generation_failed", classified.safeDetail);
        const failedTheme = await this.firebase.getDocument(`themes/${payload.themeId}`); if (failedTheme) await this.firebase.putDocument(`themes/${payload.themeId}`, { ...failedTheme, status: "failed", approvalState: "failed", updatedAt: failedAt });
        await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "failed", message: classified.safeDetail, retryable: classified.retryable, safeErrorCode: classified.safeCode, safeErrorDetail: classified.safeDetail, failedAt, updatedAt: failedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId, attemptCount: queueJob.attemptsMade + 1 });
      } else {
        await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "queued", progress: 0, message: "Queued for retry", updatedAt: new Date().toISOString(), leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId, attemptCount: queueJob.attemptsMade + 1 });
      }
      this.logger.error({ event: "theme.generation.failed", correlationId: payload.correlationId, durableJobId: payload.jobId, queueJobId: queueJob.id, queueName: THEME_GENERATION_QUEUE, safeErrorCategory: classified.safeCode, retryable: classified.retryable, attempt: queueJob.attemptsMade + 1 }, "Theme generation failed");
      throw classified;
    }
  }
  private async progress(queueJob: Job<ThemeQueuePayload>, job: R, progress: number, message: string) { await queueJob.updateProgress(progress); await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "running", progress, message, updatedAt: new Date().toISOString() }); }
  private async complete(queueJob: Job<ThemeQueuePayload>, running: R, payload: ThemeQueuePayload, result?: R) { await queueJob.updateProgress(100); const completedAt = new Date().toISOString(); await this.firebase.putDocument(`asyncJobs/${payload.jobId}`, { ...running, status: "completed", progress: 100, message: "Theme generation completed", result, retryable: false, completedAt, updatedAt: completedAt, leaseOwner: null, leaseExpiresAt: null, correlationId: payload.correlationId }); }
  private async cancel(job: R) { const now = new Date().toISOString(), themeId = this.s(job.themeId); await this.firebase.putDocument(`asyncJobs/${this.s(job.id)}`, { ...job, status: "cancelled", message: "Theme generation cancelled", cancelledAt: now, updatedAt: now }); const theme = await this.firebase.getDocument(`themes/${themeId}`); if (theme) await this.firebase.putDocument(`themes/${themeId}`, { ...theme, status: "cancelled", approvalState: "cancelled", updatedAt: now }); await this.event(job, { jobId: this.s(job.id), themeId, organizationId: this.s(job.organizationId), sourceRevision: this.s(job.sourceRevision), correlationId: this.s(job.correlationId) }, "theme.generation_cancelled", "Theme generation cancelled"); }
  private async event(job: R, payload: ThemeQueuePayload, action: string, summary: string, versionId?: string, revision?: unknown) { const id = randomUUID(); await this.firebase.putDocument(`themeEvents/${id}`, { id, organizationId: payload.organizationId, entityType: "theme", entityId: payload.themeId, ...(versionId ? { versionId } : {}), revision: revision ?? payload.sourceRevision, action, actorId: this.s(job.createdBy) || "system", timestamp: new Date().toISOString(), summary, correlationId: payload.correlationId }); }
  private nextRevision(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value + 1 : randomUUID(); }
  private matches(job: R, payload: ThemeQueuePayload) { return this.s(job.organizationId) === payload.organizationId && this.s(job.themeId) === payload.themeId && this.s(job.sourceRevision) === payload.sourceRevision && this.s(job.correlationId) === payload.correlationId; }
  private s(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
  private arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
}
