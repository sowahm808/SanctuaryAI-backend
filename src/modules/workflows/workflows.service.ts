import { ConflictException, ForbiddenException, Injectable, NotFoundException, NotImplementedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { requestContext } from "../../common/request-context";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";
import { TenantRepository } from "../../database/tenant-repository";
import { WorkflowListQueryDto, WorkflowMutationDto } from "./dto";

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
  constructor(private readonly firebase: FirebaseService, private readonly tenants?: TenantRepository) {}

  async list(user: FirebaseIdentity, area: string, query: WorkflowListQueryDto = new WorkflowListQueryDto()) {
    const cfg = this.cfg(area); const { organizationId } = await this.active(user, cfg.read);
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
    await this.firebase.putDocument(`${cfg.collection}/${this.s(item.id)}`, item); await this.audit(user, organizationId, `${area}.create`, { id: this.s(item.id), revision: this.s(item.revision) }); return item;
  }

  async get(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return this.safeItem(item); }

  async patch(user: FirebaseIdentity, area: string, id: string, body: WorkflowMutationDto) {
    const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.update); this.assertRevision(item, body as R); this.assertUnlocked(item);
    const revision = randomUUID(), now = new Date().toISOString(); const versions = this.arr(item.versions).concat({ id: randomUUID(), revision, actor: user.uid, createdAt: now, approvalState: "draft", changeSummary: this.s(body.changeSummary) || `${area} updated`, snapshot: body });
    const updated = this.safeItem({ ...item, ...body, id, organizationId: item.organizationId, revision, versions, updatedAt: now }); await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.audit(user, this.s(item.organizationId), `${area}.update`, { id, revision }); return updated;
  }

  async draft(user: FirebaseIdentity, area: string, id: string, body: R) { return this.patch(user, area, id, { ...body, status: "draft" }); }
  async versions(user: FirebaseIdentity, area: string, id: string) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return { versions: this.arr(item.versions) }; }
  async comment(user: FirebaseIdentity, area: string, id: string, body: R) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.update); const c = { id: randomUUID(), body: this.s(body.body), mentions: this.arr(body.mentions), resolved: false, actor: user.uid, createdAt: new Date().toISOString(), correlationId: requestContext.getStore()?.correlationId ?? "" }; const updated = { ...item, comments: this.arr(item.comments).concat(c), updatedAt: new Date().toISOString() }; await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.audit(user, this.s(item.organizationId), `${area}.comment`, { id, commentId: c.id }); return c; }
  async action(user: FirebaseIdentity, area: string, id: string, action: string, body: R = {}) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, action === "approve" ? (cfg.approve ?? cfg.update) : cfg.update); const revision = randomUUID(); const locks = action === "approve" ? this.arr(item.locks).concat({ reason: "approved", lockedRevision: this.s(body.revision) || this.s(item.revision), actor: user.uid, timestamp: new Date().toISOString() }) : this.arr(item.locks); const updated = { ...item, status: action, approvalState: action, revision, locks, updatedAt: new Date().toISOString() }; await this.firebase.putDocument(`${cfg.collection}/${id}`, updated); await this.audit(user, this.s(item.organizationId), `${area}.${action}`, { id, revision, feedback: this.s(body.feedback) }); return this.safeItem(updated); }
  async exportJob(user: FirebaseIdentity, area: string, id: string, body: R = {}) { const cfg = this.cfg(area); const item = await this.item(user, cfg, id, cfg.read); return this.job(user, this.s(item.organizationId), cfg.exportType ?? `${area}_job`, { id, ...body }, this.s(body.sourceRevision) || this.s(item.revision)); }
  async generate(user: FirebaseIdentity, area: string, id: string, body: R = {}) { void body; const cfg = this.cfg(area); await this.item(user, cfg, id, cfg.update); throw new NotImplementedException({ code: "generation_not_supported", message: `Generation for ${area} is not available until its typed worker is deployed.` }); }

  private cfg(area: string) { const cfg = CONFIG[area]; if (!cfg) throw new NotFoundException({ code: "workflow_not_found", message: "Workflow area not found." }); return cfg; }
  private async item(user: FirebaseIdentity, cfg: (typeof CONFIG)[string], id: string, perm: string) { const item = await this.firebase.getDocument(`${cfg.collection}/${id}`); if (!item) throw new NotFoundException({ code: "resource_not_found", message: "Resource not found." }); await this.active(user, perm, this.s(item.organizationId)); return item; }
  private async active(user: FirebaseIdentity, perm: string, org?: string) { const u = await this.firebase.getDocument(`users/${user.uid}`); const organizationId = org || this.s(u?.activeOrganizationId); const m = organizationId ? await this.firebase.getDocument(`memberships/${organizationId}_${user.uid}`) : undefined; if (!organizationId || m?.status !== "ACTIVE" || !this.hasPermission(m, perm)) throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership with permission is required." }); return { organizationId }; }
  private hasPermission(membership: R | undefined, permission: string) { const values = this.arr(membership?.permissions).map((value) => this.s(value)); const role = this.s(membership?.role); const [area, action] = permission.split("."); const legacyWrite = area && ["create", "update", "upload"].includes(action ?? "") ? `${area}.write` : ""; const legacyRead = action === "read" && values.includes("organizations.read"); const legacyApprovalReview = area === "reviews" && ["read", "approve"].includes(action ?? "") && values.includes("approvals.review"); return values.includes(permission) || (legacyWrite ? values.includes(legacyWrite) : false) || legacyRead || legacyApprovalReview || values.includes("admin") || ["ChurchAdministrator", "SuperAdministrator"].includes(role); }
  private assertRevision(item: R, body: R) { const revision = this.s(body.expectedRevision) || this.s(body.revision); if (!revision) throw new ConflictException({ code: "expected_revision_required", message: "expectedRevision is required." }); if (revision !== this.s(item.revision)) throw new ConflictException({ code: "revision_conflict", message: "The resource is stale.", currentRevision: this.s(item.revision) }); }
  private canReview(member: R) { return member.status === "ACTIVE" && (this.hasPermission(member, "reviews.approve") || this.hasPermission(member, "approvals.review")); }
  private assertUnlocked(item: R) { if (this.arr(item.locks).length) throw new ForbiddenException({ code: "resource_locked", message: "Approved locked resources require unlock permission." }); }
  private safeItem(item: R) { const { accessToken, refreshToken, providerResponse, rawProviderPayload, ...safe } = item; void accessToken; void refreshToken; void providerResponse; void rawProviderPayload; return safe; }
  private async job(user: FirebaseIdentity, organizationId: string, type: string, payload: R, sourceRevision: string) { const now = new Date().toISOString(), id = randomUUID(); const job = { id, organizationId, type, status: "queued", progress: 0, retryable: true, cancellationSupported: true, payload, sourceRevision, createdBy: user.uid, createdAt: now, updatedAt: now }; await this.firebase.putDocument(`asyncJobs/${id}`, job); await this.audit(user, organizationId, `${type}.queue`, payload); return job; }
  private async audit(user: FirebaseIdentity, organizationId: string, action: string, summary: R) { const id = randomUUID(); await this.firebase.putDocument(`auditEvents/${id}`, { id, correlationId: requestContext.getStore()?.correlationId ?? "", actor: user.uid, organizationId, resource: action, outcome: "success", summary, createdAt: new Date().toISOString() }); }
  private arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; } private s(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
}
