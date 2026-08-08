import { ConflictException, Injectable, Optional, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";
import { ApprovalRepository } from "./approval.repository";

type R = Record<string, unknown>;

@Injectable()
export class ApprovalWorkflowService {
  constructor(private readonly firebase: FirebaseService, @Optional() private readonly repository?: ApprovalRepository) {}

  private get repo() { return this.repository ?? new ApprovalRepository(this.firebase); }

  async current(organizationId: string, resourceType: string, resourceId: string, activeApprovalId?: string): Promise<R | null> {
    if (activeApprovalId) {
      const approval = await this.firebase.getDocument(`approvals/${activeApprovalId}`);
      if (approval && this.belongsTo(approval, organizationId, resourceType, resourceId)) return this.view(approval);
    }
    const approval = await this.repo.findCurrentForResource(organizationId, resourceType, resourceId);
    return approval ? this.view(approval as unknown as R) : null;
  }

  async submit(user: FirebaseIdentity, resource: R, resourceType: string, versionId: string, revision: string, reviewerUserId?: string): Promise<R> {
    if (!versionId || !revision) throw new ConflictException({ code: "workflow_version_required", message: "Save or generate a version before submitting for review." });
    const organizationId = this.s(resource.organizationId), resourceId = this.s(resource.id);
    const existing = await this.repo.findCurrentForResource(organizationId, resourceType, resourceId, versionId, revision);
    if (existing && ["pending", "in_review", "changes_requested"].includes(existing.status)) throw new ConflictException({ code: "workflow_review_already_active", message: "This resource version already has an active approval." });
    const actor = await this.internalUserId(user);
    if (reviewerUserId) await this.assertReviewer(organizationId, reviewerUserId);
    const approval = await this.repo.create({ organizationId, resourceType, resourceId, versionId, revision, status: "pending", requestedByUserId: actor, reviewerUserId: reviewerUserId || undefined });
    if (reviewerUserId) {
      const notificationId = randomUUID();
      await this.firebase.putDocument(`notifications/${notificationId}`, {
        id: notificationId,
        organizationId,
        userId: reviewerUserId,
        type: "approval_requested",
        status: "unread",
        resourceType,
        resourceId,
        approvalId: approval.id,
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt,
      });
    }
    return this.view(approval as unknown as R);
  }

  async transition(approvalId: string, status: "in_review" | "changes_requested" | "approved" | "rejected", user: FirebaseIdentity, reason?: string): Promise<R> {
    const raw = await this.firebase.getDocument(`approvals/${approvalId}`);
    const organizationId = this.s(raw?.organizationId);
    const approval = organizationId ? await this.repo.findById(organizationId, approvalId) : null;
    if (!approval) throw new ConflictException({ code: "active_approval_required", message: "No active approval exists for this resource version." });
    const reviewer = await this.internalUserId(user);
    const updated = status === "approved" ? await this.repo.approve(organizationId, approvalId, reviewer, reason)
      : status === "rejected" ? await this.repo.reject(organizationId, approvalId, reviewer, reason)
        : status === "changes_requested" ? await this.repo.requestChanges(organizationId, approvalId, reviewer, reason)
          : await this.repo.assign(organizationId, approvalId, reviewer);
    return this.view(updated);
  }

  async compensateFailedSubmission(organizationId: string, approvalId: string) { await this.repo.removeAfterFailedSubmission(organizationId, approvalId); }

  private belongsTo(approval: R, organizationId: string, resourceType: string, resourceId: string) {
    return this.s(approval.organizationId) === organizationId && (this.s(approval.resourceType) || this.s(approval.contentType)) === resourceType && (this.s(approval.resourceId) || this.s(approval.contentId)) === resourceId;
  }
  private view(approval: R): R {
    const raw = this.s(approval.status), status = raw === "pending_approval" ? "pending" : raw;
    return { id: approval.id, status, resourceType: approval.resourceType ?? approval.contentType, resourceId: approval.resourceId ?? approval.contentId, versionId: approval.versionId, revision: approval.revision, requestedByUserId: approval.requestedByUserId ?? approval.requestedBy, reviewerUserId: approval.reviewerUserId ?? approval.assigneeId, submittedAt: approval.submittedAt ?? approval.createdAt, decidedAt: approval.decidedAt, reason: approval.reason ?? approval.feedback, comments: Array.isArray(approval.comments) ? approval.comments : [] };
  }
  private s(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
  private async internalUserId(user: FirebaseIdentity) { const profile = await this.firebase.getDocument(`users/${user.uid}`); return this.s(profile?.id) || this.s(profile?.userId) || user.uid; }
  private async assertReviewer(organizationId: string, reviewerUserId: string) {
    const direct = await this.firebase.getDocument(`memberships/${organizationId}_${reviewerUserId}`);
    const values = direct ? [direct] : await this.firebase.queryDocuments("memberships", "organizationId", organizationId, "updatedAt", "desc", 500);
    const membership = values.find((item) => (this.s(item.userId) || this.s(item.uid) || this.s(item.id).replace(`${organizationId}_`, "")) === reviewerUserId);
    const permissions = Array.isArray(membership?.permissions) ? membership.permissions : [];
    const role = this.s(membership?.role);
    if (membership?.status !== "ACTIVE" || (!permissions.some((value) => ["reviews.approve", "approvals.review", "admin"].includes(this.s(value))) && !["ChurchAdministrator", "SuperAdministrator"].includes(role))) {
      throw new UnprocessableEntityException({ code: "reviewer_not_eligible", message: "The selected user must have an active reviewer membership in this organization." });
    }
  }
}
