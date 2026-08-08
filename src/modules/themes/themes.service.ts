import { ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException, Optional, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { requestContext } from "../../common/request-context";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";
import { FirestoreRequestError } from "../../database/firestore-request.error";
import { ThemeActionDto, ThemeCommentDto, ThemeDraftUpdateDto, ThemeInputDto, ThemeListQueryDto, ThemeOutputDto, ThemePatchInputDto, ThemeRefineDto } from "./dto";
import { ThemeGenerationService } from "./theme-generation.service";
import { ThemeGenerationQueue } from "./theme-generation.queue";
import { ApprovalWorkflowService } from "../workflows/approval-workflow.service";

type R = Record<string, unknown>;
export const THEME_STATES = ["draft", "generating", "version_ready", "pending_approval", "in_review", "changes_requested", "approved", "rejected", "failed", "cancelled"] as const;
export type ThemeState = typeof THEME_STATES[number];
const TRANSITIONS: Readonly<Record<ThemeState, readonly ThemeState[]>> = {
  draft: ["generating", "cancelled"], generating: ["version_ready", "failed", "cancelled"],
  version_ready: ["generating", "pending_approval", "cancelled"], pending_approval: ["in_review", "cancelled"],
  in_review: ["approved", "changes_requested", "rejected"], changes_requested: ["generating", "version_ready", "cancelled"],
  approved: ["draft"], rejected: ["draft", "generating"], failed: ["generating", "cancelled"], cancelled: ["draft"],
};
const FIELDS = ["title", "subtitle", "scriptures", "explanation", "pastoralIntroduction", "objectives", "weeklyDirection", "confession", "declaration", "hashtags", "flyerHeadline", "designConcept"];
const LABELS: Record<string, string> = { "theme.created": "Theme created", "theme.draft_saved": "Draft saved", "theme.generation_queued": "Generation queued", "theme.generation_started": "Generation started", "theme.generation_completed": "Theme generated", "theme.generation_failed": "Generation failed", "theme.generation_cancelled": "Generation cancelled", "theme.refined": "Theme refined", "theme.version_created": "Version created", "theme.submitted_for_review": "Submitted for review", "theme.review_started": "Review started", "theme.comment_added": "Comment added", "theme.changes_requested": "Changes requested", "theme.rejected": "Theme rejected", "theme.approved": "Theme approved", "theme.new_revision_created": "New revision created" };

@Injectable()
export class ThemesService {
  private readonly logger = new Logger(ThemesService.name);
  constructor(private readonly firebase: FirebaseService, private readonly generator: ThemeGenerationService, private readonly queue: ThemeGenerationQueue, @Optional() private readonly approvals?: ApprovalWorkflowService) {}

  async list(user: FirebaseIdentity, query: ThemeListQueryDto) {
    const { organizationId } = await this.active(user, "themes.read");
    try {
      const page = await this.firebase.queryDocumentsPage("themes", "organizationId", organizationId, query.sort, query.direction, query.limit, query.cursor);
      return { items: Array.isArray(page?.items) ? page.items : [], nextCursor: page?.nextCursor ?? null, previousCursor: page?.previousCursor ?? null, total: Number.isFinite(page?.total) ? page.total : 0 };
    } catch (error) {
      if (error instanceof HttpException && !(error instanceof ServiceUnavailableException)) throw error;
      const correlationId = requestContext.getStore()?.correlationId ?? randomUUID();
      const provider = error instanceof FirestoreRequestError ? error : undefined;
      this.logger.error({ event: "theme.collection.query_failed", correlationId, organizationId, firestoreQuery: { collection: "themes", where: ["organizationId", "==", organizationId], orderBy: [query.sort, query.direction], tieBreaker: ["__name__", query.direction], limit: query.limit + 1 }, httpStatus: provider?.httpStatus, firebaseStatus: provider?.firebaseStatus, firebaseCode: provider?.firebaseCode, firebaseMessage: provider?.firebaseMessage, firebaseDetails: provider?.firebaseDetails, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : String(error) }, "Theme collection query failed");
      const safe = { code: provider?.firebaseStatus === "FAILED_PRECONDITION" ? "firestore_index_unavailable" : "theme_list_failed", detail: provider?.firebaseStatus === "FAILED_PRECONDITION" ? "Themes are temporarily unavailable while database infrastructure is prepared." : "The theme query could not be completed.", correlationId, validation: [] };
      if (provider?.firebaseStatus === "FAILED_PRECONDITION") throw new ServiceUnavailableException(safe, { cause: error });
      throw new InternalServerErrorException(safe, { cause: error });
    }
  }

  async create(user: FirebaseIdentity, dto: ThemeInputDto) {
    const { organizationId } = await this.active(user, "themes.create");
    const input = this.normalizeInput(dto); this.validateInput(input);
    const now = new Date().toISOString(), id = randomUUID();
    const theme = { id, organizationId, input, currentOutput: this.blank(), status: "draft", approvalState: "draft", revision: 1, currentVersionId: null, locks: [], createdBy: user.uid, createdAt: now, updatedAt: now };
    await this.firebase.putDocument(`themes/${id}`, theme);
    await this.event(user, theme, "theme.created", "Theme draft created");
    return theme;
  }

  async get(user: FirebaseIdentity, id: string) { return this.theme(user, id, "themes.read"); }
  async patchDraft(user: FirebaseIdentity, id: string, dto: ThemeDraftUpdateDto) { const { expectedRevision, revision, draft, ...input } = dto; const expected = expectedRevision ?? revision; if (expected === undefined || expected === null || this.value(expected) === "") throw new ConflictException({ code: "expected_revision_required", message: "expectedRevision (or legacy revision) is required." }); return this.saveDraft(user, id, expected, { ...input, ...(draft ?? {}) }); }
  async patchInput(user: FirebaseIdentity, id: string, dto: ThemePatchInputDto) { const { revision, idempotencyKey, ...input } = dto; void idempotencyKey; return this.saveDraft(user, id, revision, input); }

  private async saveDraft(user: FirebaseIdentity, id: string, expectedRevision: unknown, input: R) {
    const theme = await this.theme(user, id, "themes.update"); this.assertRevision(theme, expectedRevision);
    const current = this.state(theme), wasApproved = current === "approved";
    const revision = this.nextRevision(theme.revision), updatedAt = new Date().toISOString();
    const merged = { ...((theme.input as R) ?? {}), ...input }; this.validateInput(merged);
    const updated = { ...theme, input: merged, revision, status: wasApproved ? "draft" : current, approvalState: wasApproved ? "draft" : current, currentVersionId: wasApproved ? null : theme.currentVersionId, locks: wasApproved ? [] : this.arr(theme.locks), updatedAt };
    await this.firebase.putDocument(`themes/${id}`, updated);
    await this.event(user, updated, wasApproved ? "theme.new_revision_created" : "theme.draft_saved", wasApproved ? `Revision ${revision} created from approved theme` : `Draft revision ${revision} saved`);
    return updated;
  }

  async generate(user: FirebaseIdentity, id: string, body: Partial<ThemeRefineDto> = {}, key?: string) { const t = await this.theme(user, id, "themes.update"); return this.queueGeneration(user, t, id, "theme_generate", body.sourceRevision ?? this.value(t.revision), body.targetFields ?? FIELDS, undefined, key); }
  async refine(user: FirebaseIdentity, id: string, dto: ThemeRefineDto, key?: string) { const t = await this.theme(user, id, "themes.update"); return this.queueGeneration(user, t, id, "theme_refine", dto.sourceRevision ?? this.value(t.revision), dto.targetFields ?? FIELDS, dto.scope, key); }

  async output(user: FirebaseIdentity, id: string, dto: ThemeOutputDto) {
    const t = await this.theme(user, id, "themes.update"); this.assertRevision(t, dto.revision);
    if (this.state(t) === "approved") throw new ConflictException({ code: "approved_version_immutable", message: "Approved versions cannot be modified; save a new draft revision first." });
    const now = new Date().toISOString(), revision = this.nextRevision(t.revision), versionId = randomUUID(), output = { ...this.blank(), ...(dto.output ?? {}) };
    const version = { id: versionId, themeId: id, organizationId: t.organizationId, revision, output, status: "version_ready", createdBy: user.uid, createdAt: now, changeSummary: dto.changeSummary ?? "Theme output updated" };
    await this.firebase.putDocument(`themes/${id}/versions/${versionId}`, version);
    const updated = { ...t, currentOutput: output, currentVersionId: versionId, revision, status: "version_ready", approvalState: "version_ready", updatedAt: now };
    await this.firebase.putDocument(`themes/${id}`, updated); await this.event(user, updated, "theme.version_created", `Theme version ${revision} created`, versionId);
    return updated;
  }

  async preview(user: FirebaseIdentity, id: string) { const t = await this.theme(user, id, "themes.read"); return { id: t.id, versionId: t.currentVersionId ?? null, revision: t.revision, status: this.state(t), ...this.blank(), ...((t.currentOutput as R) ?? {}) }; }
  async versions(user: FirebaseIdentity, id: string) { const t = await this.theme(user, id, "themes.read"); const items = await this.firebase.queryDocuments(`themes/${id}/versions`, "organizationId", this.s(t.organizationId), "createdAt", "desc", 100); return { items: Array.isArray(items) ? items : [] }; }
  async timeline(user: FirebaseIdentity, id: string) { const t = await this.theme(user, id, "themes.read"); const events = await this.firebase.queryDocuments("themeEvents", "organizationId", this.s(t.organizationId), "timestamp", "desc", 500); return { items: events.filter(e => e.entityType === "theme" && e.entityId === id).map(e => ({ ...e, label: LABELS[this.s(e.action)] ?? this.s(e.action) })) }; }

  async comment(user: FirebaseIdentity, id: string, dto: ThemeCommentDto, commentId?: string) {
    const t = await this.theme(user, id, "themes.update"), now = new Date().toISOString(), cid = commentId ?? randomUUID();
    const existing = commentId ? await this.firebase.getDocument(`themes/${id}/comments/${cid}`) : undefined;
    if (commentId && !existing) throw new NotFoundException({ code: "theme_comment_not_found", message: "Comment not found." });
    const comment = { ...existing, id: cid, organizationId: t.organizationId, themeId: id, body: dto.body, mentions: dto.mentions ?? [], resolved: dto.resolved === true, actorId: existing?.actorId ?? user.uid, createdAt: existing?.createdAt ?? now, updatedAt: now, correlationId: requestContext.getStore()?.correlationId ?? "" };
    await this.firebase.putDocument(`themes/${id}/comments/${cid}`, comment);
    if (!commentId) await this.event(user, t, "theme.comment_added", "Comment added", this.s(t.currentVersionId));
    return comment;
  }

  async action(user: FirebaseIdentity, id: string, action: string, dto: ThemeActionDto) {
    const permission = action === "approve" || action === "changes_requested" || action === "rejected" ? "themes.approve" : "themes.update";
    const t = await this.theme(user, id, permission); if (dto.revision !== undefined) this.assertRevision(t, dto.revision);
    if (action === "review") return this.submitReview(user, t, dto.reviewerUserId);
    const target: ThemeState = action === "approve" ? "approved" : action as ThemeState;
    // A reviewer opening a pending item is an authoritative transition before deciding.
    let source = this.state(t); if (source === "pending_approval") source = "in_review";
    this.assertTransition(source, target);
    const now = new Date().toISOString(), locks = target === "approved" ? [{ reason: "approved", versionId: t.currentVersionId, lockedRevision: t.revision, actorId: user.uid, timestamp: now }] : this.arr(t.locks);
    const updated = { ...t, status: target, approvalState: target, locks, updatedAt: now };
    const approvalId = this.s(t.activeApprovalId);
    if (!approvalId || !this.approvals) throw new ConflictException({ code: "active_approval_required", message: "No canonical approval exists for this theme version." });
    await this.approvals.transition(approvalId, target === "changes_requested" ? "changes_requested" : target === "approved" ? "approved" : "rejected", user, dto.feedback);
    await this.firebase.putDocument(`themes/${id}`, updated);
    await this.event(user, updated, `theme.${target}`, dto.feedback ?? LABELS[`theme.${target}`] ?? target, this.s(t.currentVersionId)); return updated;
  }

  private async submitReview(user: FirebaseIdentity, t: R, reviewerUserId?: string) {
    if (!this.s(t.currentVersionId)) throw new ConflictException({ code: "theme_version_required", message: "Generate or save a version before submitting for review." });
    this.assertTransition(this.state(t), "pending_approval");
    if (!this.approvals) throw new InternalServerErrorException({ code: "approval_pipeline_unavailable", message: "Approval persistence is unavailable." });
    const approval = await this.approvals.submit(user, t, "theme", this.s(t.currentVersionId), this.value(t.revision), this.s(reviewerUserId));
    const now = new Date().toISOString();
    const updated = { ...t, status: "pending_approval", approvalState: "pending_approval", activeApprovalId: approval.id, updatedAt: now };
    try { await this.firebase.putDocument(`themes/${this.s(t.id)}`, updated); } catch (error) { await this.approvals.compensateFailedSubmission(this.s(t.organizationId), this.s(approval.id)); throw error; }
    await this.event(user, updated, "theme.submitted_for_review", "Theme submitted for review", this.s(t.currentVersionId)); return { theme: updated, approval };
  }

  async template(user: FirebaseIdentity, id: string) { const t = await this.theme(user, id, "themes.read"), tid = randomUUID(), now = new Date().toISOString(); const template = { id: tid, organizationId: t.organizationId, sourceThemeId: id, sourceRevision: t.revision, fields: { ...this.blank(), ...((t.currentOutput as R) ?? {}) }, createdBy: user.uid, createdAt: now }; await this.firebase.putDocument(`themeTemplates/${tid}`, template); return template; }

  private async queueGeneration(user: FirebaseIdentity, t: R, themeId: string, type: string, sourceRevision: string, targetFields: string[], scope?: string, idempotencyKey?: string) {
    this.validateInput((t.input as ThemeInputDto) ?? {}); if (sourceRevision !== this.value(t.revision)) throw new ConflictException({ code: "theme_revision_conflict", message: "The theme is stale.", currentRevision: t.revision });
    const fields = targetFields.filter(field => FIELDS.includes(field)); if (!fields.length) throw new UnprocessableEntityException({ code: "theme_validation_failed", message: "At least one valid target field is required." });
    const organizationId = this.s(t.organizationId), suppliedKey = this.s(idempotencyKey), resolvedKey = suppliedKey || createHash("sha256").update([organizationId, themeId, type, sourceRevision].join("\0")).digest("hex"), jobId = this.stableJobId(organizationId, themeId, type, sourceRevision, resolvedKey);
    const existing = await this.firebase.getDocument(`asyncJobs/${jobId}`); if (existing) return this.publicJob(existing);
    this.assertTransition(this.state(t), "generating");
    const correlationId = requestContext.getStore()?.correlationId ?? randomUUID(), now = new Date().toISOString(), payload = { themeId, sourceRevision, ...(scope ? { scope } : {}) };
    const job = { id: jobId, organizationId, themeId, operation: type, type, status: "pending_enqueue", progress: 0, message: "Preparing to queue", retryable: true, cancellationSupported: true, payload, sourceRevision, targetFields: fields, idempotencyKey: resolvedKey, correlationId, attemptCount: 0, maxAttempts: 3, createdBy: user.uid, createdAt: now, updatedAt: now };
    await this.firebase.putDocument(`asyncJobs/${jobId}`, job); await this.firebase.putDocument(`themes/${themeId}`, { ...t, status: "generating", approvalState: "generating", updatedAt: now });
    let queued: R;
    try { const queueJobId = await this.queue.publish({ jobId, correlationId, organizationId, themeId, sourceRevision }); const queuedAt = new Date().toISOString(); queued = { ...job, status: "queued", message: "Queued", queueJobId, queuedAt, enqueuedAt: queuedAt, updatedAt: queuedAt }; await this.firebase.putDocument(`asyncJobs/${jobId}`, queued); }
    catch (error) { const failedAt = new Date().toISOString(); await this.firebase.putDocument(`asyncJobs/${jobId}`, { ...job, status: "enqueue_failed", safeErrorCode: "generation_queue_unavailable", safeErrorDetail: "Theme generation cannot be queued right now. Please retry shortly.", failedAt, updatedAt: failedAt }); await this.firebase.putDocument(`themes/${themeId}`, { ...t, status: "failed", approvalState: "failed", updatedAt: failedAt }); throw error; }
    await this.event(user, t, "theme.generation_queued", "Theme generation queued"); return this.publicJob(queued);
  }

  private assertTransition(from: ThemeState, to: ThemeState) { if (!TRANSITIONS[from].includes(to)) throw new ConflictException({ code: "invalid_theme_transition", message: `Theme cannot transition from ${from} to ${to}.`, from, to }); }
  private state(t: R): ThemeState { const raw = this.s(t.status) || this.s(t.approvalState) || "draft"; return (THEME_STATES as readonly string[]).includes(raw) ? raw as ThemeState : "draft"; }
  private assertRevision(t: R, expected: unknown) { if (this.value(t.revision) !== this.value(expected)) throw new ConflictException({ code: "revision_conflict", message: "The theme is stale.", currentRevision: t.revision }); }
  private nextRevision(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value + 1 : randomUUID(); }
  private validateInput(dto: ThemeInputDto) { if (!this.s(dto.topic) && !this.s(dto.spiritualEmphasis)) throw new UnprocessableEntityException({ code: "theme_validation_failed", message: "A topic or spiritual emphasis is required." }); if (dto.date && Number.isNaN(Date.parse(dto.date)) && !/^\w+\s+\d{4}$/.test(dto.date)) throw new UnprocessableEntityException({ code: "theme_validation_failed", message: "Date is invalid." }); }
  private normalizeInput(dto: ThemeInputDto): ThemeInputDto { const brief = dto.brief ?? {}, scripture = this.s(brief.main_scripture); return { ...dto, date: this.s(dto.date) || this.s(brief.month_and_year) || undefined, topic: this.s(dto.topic) || this.s(brief.topic) || undefined, spiritualEmphasis: this.s(dto.spiritualEmphasis) || this.s(brief.spiritual_emphasis) || undefined, pastorNotes: this.s(dto.pastorNotes) || this.s(brief.pastor_notes) || undefined, tone: this.s(dto.tone) || this.s(brief.tone) || undefined, audience: this.s(dto.audience) || this.s(brief.audience) || undefined, bibleTranslation: this.s(dto.bibleTranslation) || this.s(brief.bible_translation) || undefined, scriptures: dto.scriptures ?? (scripture ? [scripture] : undefined) }; }
  private async theme(user: FirebaseIdentity, id: string, perm: string): Promise<R> { const t = await this.firebase.getDocument(`themes/${id}`); if (!t) throw new NotFoundException({ code: "theme_not_found", message: "Theme not found." }); await this.active(user, perm, this.s(t.organizationId)); return { id, ...t }; }
  private async active(user: FirebaseIdentity, perm: string, resourceOrg?: string) { const u = await this.firebase.getDocument(`users/${user.uid}`); /* Legacy sessions predate activeOrganizationId; only an already-loaded resource plus an ACTIVE server-side membership may supply the fallback. */ const organizationId = this.s(u?.activeOrganizationId) || (!u ? this.s(resourceOrg) : ""); if (!organizationId || (resourceOrg && resourceOrg !== organizationId)) throw new ForbiddenException({ code: "organization_permission_missing", message: "The Theme is not in the active organization." }); const m = await this.firebase.getDocument(`memberships/${organizationId}_${user.uid}`), permissions = this.arr(m?.permissions), legacy = ["themes.create", "themes.update"].includes(perm) ? "themes.write" : perm; if (m?.status !== "ACTIVE" || (!permissions.includes(perm) && !permissions.includes(legacy))) throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership with permission is required." }); return { organizationId }; }
  private async event(user: FirebaseIdentity, theme: R, action: string, summary: string, versionId?: string) { const id = randomUUID(), timestamp = new Date().toISOString(); await this.firebase.putDocument(`themeEvents/${id}`, { id, organizationId: theme.organizationId, entityType: "theme", entityId: theme.id, ...(versionId ? { versionId } : {}), revision: theme.revision, action, actorId: user.uid, ...(user.name ? { actorName: user.name } : {}), timestamp, summary, correlationId: requestContext.getStore()?.correlationId ?? "" }); }
  private stableJobId(org: string, theme: string, type: string, revision: string, key: string) { return createHash("sha256").update([org, theme, type, revision, key].join("\0")).digest("hex").slice(0, 32); }
  private publicJob(job: R) { return { id: this.s(job.id), status: this.s(job.status), progress: Math.max(0, Math.min(100, Number(job.progress) || 0)), retryable: job.retryable === true, cancellationSupported: job.cancellationSupported === true, sourceRevision: job.sourceRevision, targetFields: this.arr(job.targetFields).filter((f): f is string => typeof f === "string"), ...(job.result ? { result: job.result } : {}), createdAt: this.s(job.createdAt), updatedAt: this.s(job.updatedAt) }; }
  private blank() { return Object.fromEntries(FIELDS.map(f => [f, ["scriptures", "objectives", "weeklyDirection", "hashtags"].includes(f) ? [] : ""])); }
  private arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; } private s(v: unknown) { return typeof v === "string" ? v.trim() : ""; } private value(v: unknown) { return typeof v === "number" ? String(v) : this.s(v); }
}
