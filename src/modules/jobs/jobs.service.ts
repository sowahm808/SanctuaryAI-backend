import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";

type RecordValue = Record<string, unknown>;

@Injectable()
export class JobsService {
  constructor(private readonly firebase: FirebaseService) {}

  async get(user: FirebaseIdentity, id: string): Promise<RecordValue> {
    const job = await this.firebase.getDocument(`asyncJobs/${id}`);
    if (!job) throw new NotFoundException({ code: "job_not_found", message: "The job was not found." });
    await this.assertMember(user, this.stringValue(job.organizationId));
    return this.safeJob(job);
  }

  async cancel(user: FirebaseIdentity, id: string): Promise<RecordValue> {
    const job = await this.firebase.getDocument(`asyncJobs/${id}`);
    if (!job) throw new NotFoundException({ code: "job_not_found", message: "The job was not found." });
    const organizationId = this.stringValue(job.organizationId);
    await this.assertMember(user, organizationId);
    if (!["queued", "running", "cancelling"].includes(this.stringValue(job.status))) return this.safeJob(job);
    const now = new Date().toISOString();
    const status = this.stringValue(job.status) === "running" ? "cancelling" : "cancelled";
    const updated = { ...job, status, progress: Math.max(0, Math.min(100, Number(job.progress) || 0)), message: status === "cancelling" ? "Cancellation requested" : "Cancelled", cancelledBy: user.uid, ...(status === "cancelled" ? { cancelledAt: now } : {}), updatedAt: now };
    await this.firebase.putDocument(`asyncJobs/${id}`, updated);
    return this.safeJob(updated);
  }

  private async assertMember(user: FirebaseIdentity, organizationId: string) {
    if (!organizationId) throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership is required." });
    const membership = await this.firebase.getDocument(`memberships/${organizationId}_${user.uid}`);
    if (membership?.status !== "ACTIVE") throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership is required." });
  }

  private safeJob(job: RecordValue) {
    return {
      id: this.stringValue(job.id), type: this.stringValue(job.type), status: this.normalizedStatus(job.status),
      progress: Math.max(0, Math.min(100, Math.trunc(Number(job.progress) || 0))), currentSection: this.stringValue(job.currentSection) || undefined,
      message: this.stringValue(job.message) || undefined, retryable: job.retryable === true, cancellationSupported: ["queued", "running", "cancelling"].includes(this.normalizedStatus(job.status)), safeErrorCode: this.stringValue(job.safeErrorCode) || undefined, safeErrorDetail: this.stringValue(job.safeErrorDetail) || undefined,
      sourceRevision: job.sourceRevision, targetFields: Array.isArray(job.targetFields) ? job.targetFields.filter((v): v is string => typeof v === "string") : [], ...(job.result && typeof job.result === "object" ? { result: job.result } : {}), createdAt: this.iso(job.createdAt), queuedAt: this.iso(job.queuedAt), startedAt: this.iso(job.startedAt), updatedAt: this.iso(job.updatedAt), completedAt: this.iso(job.completedAt), failedAt: this.iso(job.failedAt), cancelledAt: this.iso(job.cancelledAt),
    };
  }
  private enum(value: unknown, allowed: string[], fallback: string) { const s = this.stringValue(value); return allowed.includes(s) ? s : fallback; }
  private normalizedStatus(value: unknown) { const status = this.stringValue(value); return this.enum(status === "processing" ? "running" : status, ["queued", "running", "completed", "failed", "cancelling", "cancelled"], "queued"); }
  private iso(value: unknown) { const time = Date.parse(this.stringValue(value)); return Number.isFinite(time) ? new Date(time).toISOString() : undefined; }
  private stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
}
