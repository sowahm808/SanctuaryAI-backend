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
    if (!["queued", "running"].includes(this.stringValue(job.status))) return this.safeJob(job);
    const now = new Date().toISOString();
    const updated = { ...job, status: "cancelled", progress: Math.max(0, Math.min(100, Number(job.progress) || 0)), cancelledBy: user.uid, updatedAt: now };
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
      id: this.stringValue(job.id), type: this.stringValue(job.type), status: this.enum(job.status, ["queued", "running", "completed", "failed", "cancelled"], "queued"),
      progress: Math.max(0, Math.min(100, Math.trunc(Number(job.progress) || 0))), currentSection: this.stringValue(job.currentSection) || undefined,
      retryable: job.retryable === true, cancellationSupported: ["queued", "running"].includes(this.stringValue(job.status)), failureCode: this.stringValue(job.failureCode) || undefined,
      sourceRevision: this.stringValue(job.sourceRevision) || undefined, targetFields: Array.isArray(job.targetFields) ? job.targetFields.filter((v): v is string => typeof v === "string") : [], createdAt: this.iso(job.createdAt), updatedAt: this.iso(job.updatedAt),
    };
  }
  private enum(value: unknown, allowed: string[], fallback: string) { const s = this.stringValue(value); return allowed.includes(s) ? s : fallback; }
  private iso(value: unknown) { const time = Date.parse(this.stringValue(value)); return Number.isFinite(time) ? new Date(time).toISOString() : undefined; }
  private stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
}
