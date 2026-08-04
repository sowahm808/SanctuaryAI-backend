import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { FirebaseIdentity } from "../../database/firebase.service";
import { FirebaseService } from "../../database/firebase.service";

const DASHBOARD_READ = ["themes.read", "sermons.create", "social.schedule"];
const INTERNAL_PATH = /^\/app\/[A-Za-z0-9/_?.=&:%-]+$/;

export interface DashboardResponse { summary: Record<string, unknown>; etag: string; }

@Injectable()
export class DashboardService {
  constructor(private readonly firebase: FirebaseService) {}

  async summary(user: FirebaseIdentity): Promise<DashboardResponse> {
    const session = await this.resolveSession(user);
    if (!session.organizationId || !session.membership) {
      throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership is required." });
    }
    const permissions = this.stringArray(session.membership.permissions);
    if (!DASHBOARD_READ.some((permission) => permissions.includes(permission))) {
      throw new ForbiddenException({ code: "organization_permission_missing", message: "The active membership cannot read dashboard data." });
    }

    const readModel = await this.firebase.getDocument(`dashboardSummaries/${session.organizationId}`);
    const generatedAt = this.iso(readModel?.generatedAt) ?? new Date().toISOString();
    const stale = readModel?.stale === true;
    const useful = readModel || !stale;
    if (!useful) throw new ServiceUnavailableException({ code: "dashboard_unavailable", message: "The dashboard is temporarily unavailable." });

    const summary = this.normalizeSummary(readModel ?? {}, generatedAt, permissions);
    const etag = `W/"${createHash("sha256").update(JSON.stringify(summary)).digest("base64url")}"`;
    return { summary, etag };
  }

  private async resolveSession(user: FirebaseIdentity) {
    const userDoc = await this.firebase.getDocument(`users/${user.uid}`);
    const organizationId = this.stringValue(userDoc?.activeOrganizationId);
    const membership = organizationId ? await this.firebase.getDocument(`memberships/${organizationId}_${user.uid}`) : undefined;
    if (membership?.status !== "ACTIVE") return { organizationId, membership: undefined };
    return { organizationId, membership };
  }

  private normalizeSummary(source: Record<string, unknown>, generatedAt: string, permissions: string[]) {
    const summary: Record<string, unknown> = {
      generatedAt,
      stale: source.stale === true,
      metrics: this.array(source.metrics).map((item) => this.metric(item)),
      workItems: this.array(source.workItems).map((item) => this.workItem(item)).filter(Boolean),
      channels: this.array(source.channels).map((item) => this.channel(item)).filter(Boolean),
      sectionIssues: this.array(source.sectionIssues).map((item) => this.sectionIssue(item)).filter(Boolean),
      scheduledPosts: this.array(source.scheduledPosts).map((item) => this.scheduledPost(item)).filter(Boolean),
      publishingFailures: this.array(source.publishingFailures).map((item) => this.publishingFailure(item)).filter(Boolean),
      recentContent: this.array(source.recentContent).map((item) => this.recentContent(item)).filter(Boolean),
      quickActions: this.array(source.quickActions).map((item) => this.quickAction(item, permissions)).filter(Boolean),
    };
    const aiUsage = this.record(source.aiUsage);
    summary.aiUsage = aiUsage ? { period: this.stringValue(aiUsage.period) || "current", used: this.count(aiUsage.used), limit: this.count(aiUsage.limit), resetAt: this.iso(aiUsage.resetAt) ?? generatedAt, contextLabel: this.stringValue(aiUsage.contextLabel) } : null;
    const campaign = this.record(source.currentCampaign);
    if (campaign) summary.currentCampaign = this.campaign(campaign, generatedAt);
    const staleReason = this.stringValue(source.staleReason); if (staleReason) summary.staleReason = staleReason;
    return summary;
  }

  private metric(value: unknown) { const item = this.record(value) ?? {}; return { kind: this.stringValue(item.kind) || "unknown", label: this.stringValue(item.label) || "Metric", value: this.count(item.value), context: this.stringValue(item.context), severity: ["info","success","warning","critical"].includes(this.stringValue(item.severity)) ? this.stringValue(item.severity) : "info" }; }
  private campaign(item: Record<string, unknown>, fallback: string) { return { id: this.stringValue(item.id), title: this.stringValue(item.title), monthLabel: this.stringValue(item.monthLabel), scriptureReference: this.stringValue(item.scriptureReference), approvedAssets: this.count(item.approvedAssets), totalAssets: this.count(item.totalAssets), nextServiceAt: this.iso(item.nextServiceAt) ?? fallback, reviewCount: this.count(item.reviewCount) }; }
  private workItem(value: unknown) { const item = this.record(value); if (!item) return undefined; return { id: this.stringValue(item.id), title: this.stringValue(item.title), type: this.stringValue(item.type), status: this.stringValue(item.status), detail: this.stringValue(item.detail), href: this.internalHref(item.href, "/app/dashboard"), updatedAt: this.iso(item.updatedAt) ?? new Date().toISOString(), category: ["upcoming_service","deadline","draft_sermon","awaiting_review","approved_unscheduled"].includes(this.stringValue(item.category)) ? this.stringValue(item.category) : "deadline" }; }
  private channel(value: unknown) { const item = this.record(value); if (!item) return undefined; return { id: this.stringValue(item.id), provider: this.stringValue(item.provider), displayName: this.stringValue(item.displayName), status: ["healthy","warning","error","unknown"].includes(this.stringValue(item.status)) ? this.stringValue(item.status) : "unknown", statusLabel: this.stringValue(item.statusLabel), reconnectHref: this.internalHref(item.reconnectHref, "/app/social-accounts"), ...(this.iso(item.observedAt) ? { observedAt: this.iso(item.observedAt) } : {}) }; }
  private sectionIssue(value: unknown) { const item = this.record(value); if (!item) return undefined; return { section: this.stringValue(item.section), code: this.stringValue(item.code) || "section_unavailable", detail: this.stringValue(item.detail) || "This section is temporarily unavailable." }; }
  private scheduledPost(value: unknown) { const item = this.record(value); if (!item) return undefined; return { id: this.stringValue(item.id), title: this.stringValue(item.title), provider: this.stringValue(item.provider), scheduledAt: this.iso(item.scheduledAt) ?? new Date().toISOString(), href: this.internalHref(item.href, "/app/scheduler") }; }
  private publishingFailure(value: unknown) { const item = this.record(value); if (!item) return undefined; return { id: this.stringValue(item.id), title: this.stringValue(item.title), provider: this.stringValue(item.provider), failedAt: this.iso(item.failedAt) ?? new Date().toISOString(), recoveryHref: this.internalHref(item.recoveryHref, "/app/publishing") }; }
  private recentContent(value: unknown) { const item = this.record(value); if (!item) return undefined; return { id: this.stringValue(item.id), title: this.stringValue(item.title), type: this.stringValue(item.type), label: this.stringValue(item.label), href: this.internalHref(item.href, "/app/content"), updatedAt: this.iso(item.updatedAt) ?? new Date().toISOString() }; }
  private quickAction(value: unknown, permissions: string[]) { const item = this.record(value); if (!item) return undefined; const permission = this.stringValue(item.permission); if (permission && !permissions.includes(permission)) return undefined; return { key: this.stringValue(item.key), label: this.stringValue(item.label), permission, href: this.internalHref(item.href, "/app/dashboard") }; }
  private internalHref(value: unknown, fallback: string) { const href = this.stringValue(value); return INTERNAL_PATH.test(href) ? href : fallback; }
  private count(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0; }
  private iso(value: unknown) { const time = Date.parse(this.stringValue(value)); return Number.isFinite(time) ? new Date(time).toISOString() : undefined; }
  private array(value: unknown): unknown[] { return Array.isArray(value) ? (value as unknown[]) : []; }
  private record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
  private stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
  private stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
}
