import { ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";

type R = Record<string, unknown>;

const ACTIVE = new Set(["pending", "pending_approval", "in_review", "changes_requested"]);

@Injectable()
export class ApprovalWorkflowService {
  constructor(private readonly firebase: FirebaseService) {}

  async current(organizationId: string, resourceType: string, resourceId: string, activeApprovalId?: string): Promise<R | null> {
    if (activeApprovalId) {
      const approval = await this.firebase.getDocument(`approvals/${activeApprovalId}`);
      if (approval && this.belongsTo(approval, organizationId, resourceType, resourceId)) return this.view(approval);
    }
    const approvals = await this.firebase.queryDocuments("approvals", "organizationId", organizationId, "updatedAt", "desc", 500);
    const approval = approvals.find((candidate) => this.belongsTo(candidate, organizationId, resourceType, resourceId));
    return approval ? this.view(approval) : null;
  }

  async submit(user: FirebaseIdentity, resource: R, resourceType: string, versionId: string, revision: string, reviewerUserId?: string): Promise<R> {
    if (!versionId || !revision) throw new ConflictException({ code: "workflow_version_required", message: "Save or generate a version before submitting for review." });
    const organizationId = this.s(resource.organizationId), resourceId = this.s(resource.id);
    const existing = await this.current(organizationId, resourceType, resourceId, this.s(resource.activeApprovalId));
    if (existing && ACTIVE.has(this.s(existing.status))) throw new ConflictException({ code: "workflow_review_already_active", message: "This resource already has an active approval." });
    const now = new Date().toISOString(), id = randomUUID();
    const approval = { id, organizationId, resourceType, resourceId, contentType: resourceType, contentId: resourceId, versionId, revision, status: "pending", requestedByUserId: user.uid, requestedBy: user.uid, reviewerUserId: reviewerUserId || undefined, submittedAt: now, createdAt: now, updatedAt: now, comments: [] };
    await this.firebase.putDocument(`approvals/${id}`, approval);
    return this.view(approval);
  }

  async transition(approvalId: string, status: "in_review" | "changes_requested" | "approved" | "rejected", user: FirebaseIdentity, reason?: string): Promise<R> {
    const approval = await this.firebase.getDocument(`approvals/${approvalId}`);
    if (!approval) throw new ConflictException({ code: "active_approval_required", message: "No active approval exists for this resource version." });
    const now = new Date().toISOString();
    const updated = { ...approval, status, reviewerUserId: this.s(approval.reviewerUserId) || user.uid, decisionBy: user.uid, reason: reason || undefined, feedback: reason || undefined, ...(status === "approved" || status === "rejected" ? { decidedAt: now } : {}), updatedAt: now };
    await this.firebase.putDocument(`approvals/${approvalId}`, updated);
    return this.view(updated);
  }

  private belongsTo(approval: R, organizationId: string, resourceType: string, resourceId: string) {
    return this.s(approval.organizationId) === organizationId && (this.s(approval.resourceType) || this.s(approval.contentType)) === resourceType && (this.s(approval.resourceId) || this.s(approval.contentId)) === resourceId;
  }
  private view(approval: R): R {
    const raw = this.s(approval.status), status = raw === "pending_approval" ? "pending" : raw;
    return { id: approval.id, status, resourceType: approval.resourceType ?? approval.contentType, resourceId: approval.resourceId ?? approval.contentId, versionId: approval.versionId, revision: approval.revision, requestedByUserId: approval.requestedByUserId ?? approval.requestedBy, reviewerUserId: approval.reviewerUserId ?? approval.assigneeId, submittedAt: approval.submittedAt ?? approval.createdAt, decidedAt: approval.decidedAt, reason: approval.reason ?? approval.feedback, comments: Array.isArray(approval.comments) ? approval.comments : [] };
  }
  private s(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
}
