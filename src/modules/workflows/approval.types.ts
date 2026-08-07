export type ApprovalStatus = "pending" | "in_review" | "changes_requested" | "approved" | "rejected" | "cancelled";
export type ApprovalPriority = "low" | "normal" | "high" | "urgent";

export interface ApprovalQueueItemDto {
  id: string;
  resourceType: string;
  resourceId: string;
  title: string;
  subtitle?: string;
  status: ApprovalStatus;
  priority?: ApprovalPriority;
  dueAt?: string;
  submittedAt?: string;
  requestedByUserId: string;
  requestedByName?: string;
  reviewerUserId?: string;
  reviewerName?: string;
  versionId?: string;
  revision?: string;
  versionLabel?: string;
  preview?: unknown;
}

export interface ApprovalListResult {
  items: ApprovalQueueItemDto[];
  nextCursor: string | null;
  total: number;
}
