import { ConflictException, ForbiddenException, Injectable, NotFoundException, NotImplementedException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { requestContext } from "../../common/request-context";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";
import { TenantRepository } from "../../database/tenant-repository";
import { WorkflowListQueryDto, WorkflowMutationDto } from "./dto";
import { ApprovalWorkflowService } from "./approval-workflow.service";

type R = Record<string, unknown>;

const CONFIG: Record<string, { collection: string; create: string; read: string; update: string; approve?: string; exportType?: string }> = {
  sermons: { collection: "sermons", create: "sermons.create", read: "sermons.read", update: "sermons.update", approve: "sermons.approve", exportType: "sermon_export" },
  prayers: { collection: "prayers", create: "prayers.create", read: "prayers.read", update: "prayers.update", approve: "prayers.approve" },
  declarations: { collection: "declarations", create: "declarations.create", read: "declarations.read", update: "declarations.update", approve: "declarations.approve" },
  flyers: { collection: "flyerProjects", create: "flyers.create", read: "flyers.read", update: "flyers.update", approve: "flyers.approve", exportType: "flyer_export" },
  videos: { collection: "videoProjects", create: "videos.create", read: "videos.read", update: "videos.update", approve: "videos.approve", exportType: "video_render" },
  media: { collection: "mediaAssets", create: "media.upload", read: "media.read", update: "media.update" },
  social: { collection: "socialAccounts", create: "social.manage", read: "social.read", update: "social.manage" },
  publishing: { collection: "publishingItems", create: "social.schedule", read: "social.read", update: "social.schedule", approve: "social.approve", exportType: "publish_post" },
  calendar: { collection: "calendarItems", create: "calendar.update", read: "calendar.read", update: "calendar.update" },
  approvals: { collection: "approvals", create: "reviews.create", read: "reviews.read", update: "reviews.update", approve: "reviews.approve" },
  reviews: { collection: "reviewItems", create: "reviews.create", read: "reviews.read", update: "reviews.update", approve: "reviews.approve" },
  notifications: { collection: "notifications", create: "notifications.manage", read: "notifications.read", update: "notifications.manage" },
  users: { collection: "users", create: "users.manage", read: "team.read", update: "users.manage" },
  team: { collection: "teamMembers", create: "team.manage", read: "team.read", update: "team.manage" },
  subscriptions: { collection: "subscriptions", create: "subscription.manage", read: "subscription.read", update: "subscription.manage" },
  audit: { collection: "auditExports", create: "audit.export", read: "audit.read", update: "audit.export", exportType: "audit_export" },
  analytics: { collection: "analyticsReports", create: "analytics.export", read: "analytics.read", update: "analytics.export", exportType: "analytics_export" },
};

@Injectable()
export class WorkflowsService {
  constructor(private readonly firebase: FirebaseService, private readonly tenants?: TenantRepository, private readonly approvals = new ApprovalWorkflowService(firebase)) {}

  async list(user: FirebaseIdentity, area: string, query: WorkflowListQueryDto = new WorkflowListQueryDto()) {
    const cfg = this.cfg(area); const { organizationId } = await this.active(user, cfg.read);
    this.validateFilters(area, query.filter ?? {});
    const repository = this.tenants ?? new TenantRepository(this.firebase);
    if (area === "users") {
      const memberships = await repository.list("memberships", organizationId, { ...query, sort: "updatedAt", allowedSorts: ["updatedAt", "createdAt"], filters: {} });
      const eligible = query.filter?.eligibleFor === "review";
      const visible = eligible ? memberships.items.filter((member) => this.canReview(member)) : memberships.items;
      const items = await Promise.all(visible.map(async (member) => {
        const userId = this.s(member.userId) || this.s(member.uid) || this.s(member.id).replace(`${organizationId}_`, "");
        const profile = userId ? await this.firebase.getDocument(`users/${userId}`) : undefined;
        return this.safeItem({ ...(profile ?? {}), id: userId, userId, role: member.role, permissions: member.permissions, membershipStatus: member.status });
      }));
      return { items, nextCursor: memberships.nextCursor, previousCursor: memberships.previousCursor, total: items.length };
    }
    return repository.list(cfg.collection, organizationId, { ...query, filters: query.filter ?? {}, allowedSorts: ["updatedAt", "createdAt", "title", "name", "status"] });
  }

  async create(user: FirebaseIdentity, area: string, body: WorkflowMutationDto) {
    const cfg = this.cfg(area); const { organizationId } = await this.active(user, cfg.create); const now = new Date().toISOString();
    const item = this.safeItem({ ...body, id: randomUUID(), organizationId, status: this.s(body.status) || "draft", revision: randomUUID(), versions: [], comments: [], locks: [], auditSummary: [], createdBy: user.uid, createdAt: now, updatedAt: now });
    await this.firebase.putDocument(`${cfg.collection}/${this.s(item.id)}`, item); await this.event(user, organizationId, area, this.s(item.id), "draft_created", "Draft created", { revision: item.revision }); return item;
  }

  async get(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return this.safeItem(item); }

  async patch(user: FirebaseIdentity, area: string, id: string, body: WorkflowMutationDto) {
    const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.update); this.assertRevision(item, body as R);
    const revision = randomUUID(), versionId = randomUUID(), now = new Date().toISOString(); const versions = this.arr(item.versions).concat({ id: versionId, revision, actor: user.uid, createdAt: now, approvalState: "draft", changeSummary: this.s(body.changeSummary) || `${area} updated`, snapshot: body });
    const updated = this.safeItem({ ...item, ...body, id, organizationId: item.organizationId, status: "draft", approvalState: "draft", activeApprovalId: undefined, locks: [], revision, currentVersionId: versionId, versions, updatedAt: now }); await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.event(user, this.s(item.organizationId), area, id, "draft_saved", "Draft saved", { revision, versionId }); await this.event(user, this.s(item.organizationId), area, id, "version_created", "Version created", { revision, versionId }); return updated;
  }

  async draft(user: FirebaseIdentity, area: string, id: string, body: R) { return this.patch(user, area, id, { ...body, status: "draft" }); }
  async versions(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return { items: this.arr(item.versions) }; }
  async timeline(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); const events = await this.firebase.queryDocuments("workflowEvents", "organizationId", this.s(item.organizationId), "timestamp", "desc", 500); return { items: events.filter((event) => event.resourceType === area && event.resourceId === id) }; }
  async approval(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); if (!cfg.approve) return null; return this.approvals.current(this.s(item.organizationId), area, id, this.s(item.activeApprovalId)); }
  async comment(user: FirebaseIdentity, area: string, id: string, body: R) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.update); const c = { id: randomUUID(), body: this.s(body.body), mentions: this.arr(body.mentions), resolved: false, actor: user.uid, createdAt: new Date().toISOString(), correlationId: requestContext.getStore()?.correlationId ?? "" }; const updated = { ...item, comments: this.arr(item.comments).concat(c), updatedAt: new Date().toISOString() }; await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.event(user, this.s(item.organizationId), area, id, "comment_added", "Comment added", { versionId: item.currentVersionId, summary: c.body }); return c; }
  async action(user: FirebaseIdentity, area: string, id: string, action: string, body: R = {}) {
    const allowed = ["submit-review", "approve", "request-changes", "reject"]; if (!allowed.includes(action)) throw new UnprocessableEntityException({ code: "unsupported_workflow_action", message: "This action is not supported for content workflows." });
    const cfg = this.cfg(area); if (!cfg.approve) throw new UnprocessableEntityException({ code: "approval_not_supported", message: "This workflow does not support approvals." });
    const item = await this.item(user, cfg, id, action === "approve" || action === "reject" || action === "request-changes" ? cfg.approve : cfg.update); const now = new Date().toISOString();
    if (action === "submit-review") { const approval = await this.approvals.submit(user, item, area, this.s(item.currentVersionId), this.s(item.revision), this.s(body.reviewerUserId) || this.s(body.assigneeId)); const updated = { ...item, status: "pending_approval", approvalState: "pending_approval", activeApprovalId: approval.id, updatedAt: now }; await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.event(user, this.s(item.organizationId), area, id, "submitted_for_review", "Submitted for review", { revision: item.revision, versionId: item.currentVersionId }); return this.safeItem(updated); }
    const active = await this.approvals.current(this.s(item.organizationId), area, id, this.s(item.activeApprovalId)); if (!active) throw new ConflictException({ code: "active_approval_required", message: "No active approval exists for this resource version." });
    const target = action === "request-changes" ? "changes_requested" : action === "approve" ? "approved" : "rejected"; await this.approvals.transition(this.s(active.id), target, user, this.s(body.feedback) || this.s(body.reason));
    const locks = target === "approved" ? this.arr(item.locks).concat({ reason: "approved", versionId: item.currentVersionId, lockedRevision: item.revision, actor: user.uid, timestamp: now }) : this.arr(item.locks); const updated = { ...item, status: target, approvalState: target, locks, updatedAt: now }; await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.event(user, this.s(item.organizationId), area, id, target, target === "changes_requested" ? "Changes requested" : target[0].toUpperCase() + target.slice(1), { revision: item.revision, versionId: item.currentVersionId, summary: this.s(body.feedback) }); return this.safeItem(updated);
  }
  async exportJob(user: FirebaseIdentity, area: string, id: string, body: R = {}) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return this.job(user, this.s(item.organizationId), cfg.exportType ?? `${area}_job`, { id, ...body }, this.s(body.sourceRevision) || this.s(item.revision)); }
  async generate(user: FirebaseIdentity, area: string, id: string, body: R = {}) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.update); if (!cfg.approve) throw new NotImplementedException({ code: "generation_not_supported", message: `Generation for ${area} is not available.` }); const job = await this.job(user, this.s(item.organizationId), `${area}_generation`, { resourceType: area, resourceId: id, ...body }, this.s(item.revision)); const now = new Date().toISOString(); await this.firebase.putDocument(`${cfg.collection}/${id}`, { ...item, status: "generating", approvalState: "generating", updatedAt: now }); await this.event(user, this.s(item.organizationId), area, id, "generation_queued", "Generation queued", { revision: item.revision, summary: `Job ${this.s(job.id)} queued` }); return job; }

  private cfg(area: string) { const cfg = CONFIG[area]; if (!cfg) throw new NotFoundException({ code: "workflow_not_found", message: "Workflow area not found." }); return cfg; }
  private validateFilters(area: string, filters: Record<string, string>) {
    const allowed: Record<string, readonly string[]> = {
      users: ["eligibleFor"],
      approvals: ["status", "type", "contentType", "priority", "assigneeId", "due"],
    };
    const unknown = Object.keys(filters).filter((key) => !(allowed[area] ?? []).includes(key));
    if (unknown.length) throw new UnprocessableEntityException({ code: "unsupported_filter", message: `Unsupported filter(s): ${unknown.join(", ")}.`, validation: unknown.map((field) => ({ field: `filter[${field}]`, message: "Filter is not supported." })) });
    if (area === "users" && filters.eligibleFor !== undefined && filters.eligibleFor !== "review") throw new UnprocessableEntityException({ code: "unsupported_filter_value", message: "filter[eligibleFor] must be review." });
  }
  private async item(user: FirebaseIdentity, cfg: (typeof CONFIG)[string], id: string, perm: string) { const item = await this.firebase.getDocument(`${cfg.collection}/${id}`); if (!item) throw new NotFoundException({ code: "resource_not_found", message: "Resource not found." }); await this.active(user, perm, this.s(item.organizationId)); return item; }
  private async active(user: FirebaseIdentity, perm: string, org?: string) { const u = await this.firebase.getDocument(`users/${user.uid}`); const organizationId = org || this.s(u?.activeOrganizationId); const m = organizationId ? await this.firebase.getDocument(`memberships/${organizationId}_${user.uid}`) : undefined; if (!organizationId || m?.status !== "ACTIVE" || !this.hasPermission(m, perm)) throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership with permission is required." }); return { organizationId }; }
  private hasPermission(membership: R | undefined, permission: string) { const values = this.arr(membership?.permissions).map((value) => this.s(value)); const role = this.s(membership?.role); const [area, action] = permission.split("."); const legacyWrite = area && ["create", "update", "upload"].includes(action ?? "") ? `${area}.write` : ""; const legacyRead = action === "read" && values.includes("organizations.read"); const legacyApprovalReview = area === "reviews" && ["read", "approve"].includes(action ?? "") && values.includes("approvals.review"); return values.includes(permission) || (legacyWrite ? values.includes(legacyWrite) : false) || legacyRead || legacyApprovalReview || values.includes("admin") || ["ChurchAdministrator", "SuperAdministrator"].includes(role); }
  private assertRevision(item: R, body: R) { const revision = this.s(body.expectedRevision) || this.s(body.revision); if (!revision) throw new ConflictException({ code: "expected_revision_required", message: "expectedRevision is required." }); if (revision !== this.s(item.revision)) throw new ConflictException({ code: "revision_conflict", message: "The resource is stale.", currentRevision: this.s(item.revision) }); }
  private canReview(member: R) { return member.status === "ACTIVE" && (this.hasPermission(member, "reviews.approve") || this.hasPermission(member, "approvals.review")); }
  private safeItem(item: R) { const { accessToken, refreshToken, providerResponse, rawProviderPayload, ...safe } = item; void accessToken; void refreshToken; void providerResponse; void rawProviderPayload; return safe; }
  private async job(user: FirebaseIdentity, organizationId: string, type: string, payload: R, sourceRevision: string) { const now = new Date().toISOString(), id = randomUUID(); const job = { id, organizationId, type, status: "queued", progress: 0, retryable: true, cancellationSupported: true, payload, sourceRevision, createdBy: user.uid, createdAt: now, updatedAt: now }; await this.firebase.putDocument(`asyncJobs/${id}`, job); await this.audit(user, organizationId, `${type}.queue`, payload); return job; }
  private async audit(user: FirebaseIdentity, organizationId: string, action: string, summary: R) { const id = randomUUID(); await this.firebase.putDocument(`auditEvents/${id}`, { id, correlationId: requestContext.getStore()?.correlationId ?? "", actor: user.uid, organizationId, resource: action, outcome: "success", summary, createdAt: new Date().toISOString() }); }
  private async event(user: FirebaseIdentity, organizationId: string, resourceType: string, resourceId: string, action: string, label: string, detail: R = {}) { const id = randomUUID(), timestamp = new Date().toISOString(), correlationId = requestContext.getStore()?.correlationId ?? ""; const entry = { id, action, label, timestamp, actorUserId: user.uid, actorName: user.name, resourceType, resourceId, correlationId, ...detail }; await this.firebase.putDocument(`workflowEvents/${id}`, { ...entry, organizationId }); await this.audit(user, organizationId, `${resourceType}.${action}`, { id: resourceId, ...detail }); }
  private arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; } private s(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
}
