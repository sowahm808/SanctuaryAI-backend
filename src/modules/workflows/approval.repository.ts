import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirebaseService } from "../../database/firebase.service";
import { ApprovalStatus } from "./approval.types";

export interface ApprovalDocument {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  status: ApprovalStatus;
  requestedByUserId: string;
  reviewerUserId?: string;
  versionId?: string;
  revision?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  decidedAt?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const ACTIVE: ApprovalStatus[] = ["pending", "in_review", "changes_requested"];

@Injectable()
export class ApprovalRepository {
  static readonly collection = "approvals";
  constructor(private readonly firebase: FirebaseService) {}

  async create(input: Omit<ApprovalDocument, "id" | "createdAt" | "updatedAt" | "submittedAt">): Promise<ApprovalDocument> {
    const now = new Date().toISOString();
    const approval: ApprovalDocument = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, submittedAt: now };
    await this.firebase.putDocument(`${ApprovalRepository.collection}/${approval.id}`, approval as unknown as Record<string, unknown>);
    return approval;
  }

  async findById(organizationId: string, id: string): Promise<ApprovalDocument | null> {
    const value = await this.firebase.getDocument(`${ApprovalRepository.collection}/${id}`);
    return value && value.organizationId === organizationId ? value as unknown as ApprovalDocument : null;
  }

  async findCurrentForResource(organizationId: string, resourceType: string, resourceId: string, versionId?: string, revision?: string): Promise<ApprovalDocument | null> {
    const values = await this.listTenant(organizationId);
    return values.find((item) => item.resourceType === resourceType && item.resourceId === resourceId &&
      (!versionId || item.versionId === versionId) && (!revision || String(item.revision) === revision) && ACTIVE.includes(item.status)) ??
      values.find((item) => item.resourceType === resourceType && item.resourceId === resourceId) ?? null;
  }

  async listQueue(organizationId: string): Promise<ApprovalDocument[]> {
    return (await this.listTenant(organizationId)).filter((item) => ACTIVE.includes(item.status));
  }

  assign(organizationId: string, id: string, reviewerUserId: string) { return this.update(organizationId, id, { reviewerUserId, status: "in_review" }); }
  approve(organizationId: string, id: string, reviewerUserId: string, reason?: string) { return this.decide(organizationId, id, "approved", reviewerUserId, reason); }
  reject(organizationId: string, id: string, reviewerUserId: string, reason?: string) { return this.decide(organizationId, id, "rejected", reviewerUserId, reason); }
  requestChanges(organizationId: string, id: string, reviewerUserId: string, reason?: string) { return this.decide(organizationId, id, "changes_requested", reviewerUserId, reason); }

  async removeAfterFailedSubmission(organizationId: string, id: string): Promise<void> {
    const current = await this.findById(organizationId, id);
    if (current?.status === "pending") await this.firebase.deleteDocument(`${ApprovalRepository.collection}/${id}`);
  }

  private async decide(organizationId: string, id: string, status: ApprovalStatus, reviewerUserId: string, reason?: string) {
    return this.update(organizationId, id, { status, reviewerUserId, reason, ...(status !== "changes_requested" ? { decidedAt: new Date().toISOString() } : {}) });
  }

  private async update(organizationId: string, id: string, patch: Partial<ApprovalDocument>) {
    const current = await this.findById(organizationId, id);
    if (!current) throw new NotFoundException({ code: "approval_not_found", message: "Approval not found." });
    const updated = { ...current, ...patch, id, organizationId, updatedAt: new Date().toISOString() };
    await this.firebase.putDocument(`${ApprovalRepository.collection}/${id}`, updated);
    return updated;
  }

  private async listTenant(organizationId: string): Promise<ApprovalDocument[]> {
    const values = await this.firebase.queryDocuments(ApprovalRepository.collection, "organizationId", organizationId, "updatedAt", "desc", 500);
    return values as unknown as ApprovalDocument[];
  }
}
