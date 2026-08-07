import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirebaseIdentity, FirebaseService } from "../../database/firebase.service";
import { requestContext } from "../../common/request-context";
import { PERMISSIONS, ROLES } from "../auth/auth.types";
import { CreateOrganizationDto, InvitationDto, OnboardingDraftDto, PatchOrganizationDto, SocialHandoffDto, UpdateBrandKitDto } from "./dto";

type RecordValue = Record<string, unknown>;

export interface CreatedOrganizationResult { organization: RecordValue & { id: string; name?: string }; membership: RecordValue; role: string; permissions: string[]; subscriptionStatus: string; onboardingStatus: string; nextActionUrl?: string; recoveryMessages: string[]; }

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly firebase: FirebaseService) {}

  async create(user: FirebaseIdentity, dto: CreateOrganizationDto): Promise<CreatedOrganizationResult> {
    if ((dto.setupMode ?? "create") === "join") return this.join(user, dto);
    const existingUser = await this.firebase.getDocument(`users/${user.uid}`);
    if (typeof existingUser?.activeOrganizationId === "string") throw new ConflictException({ code: "organization_already_selected", message: "The user already has an active organization." });
    return this.createOrganization(user, dto, existingUser, false);
  }

  async current(user: FirebaseIdentity): Promise<RecordValue> { const { organization } = await this.active(user, "organizations.read"); return this.profile(organization); }

  async patchCurrent(user: FirebaseIdentity, dto: PatchOrganizationDto): Promise<RecordValue> {
    const { organization, organizationId } = await this.active(user, "settings.manage");
    if (this.stringValue(organization.revision) !== dto.revision) throw new ConflictException({ code: "revision_conflict", message: "The organization was updated by someone else.", currentRevision: this.stringValue(organization.revision) });
    const now = new Date().toISOString();
    const revision = randomUUID();
    const updated = { ...organization, ...this.profileFields(dto), revision, updatedAt: now };
    await this.firebase.putDocument(`organizations/${organizationId}`, updated);
    await this.audit(user, organizationId, "organization.update", "success", { fields: Object.keys(this.profileFields(dto)) });
    return this.profile(updated);
  }

  async brandKit(user: FirebaseIdentity): Promise<RecordValue | null> {
    const { organizationId } = await this.active(user, "organizations.read");
    const brandKit = await this.firebase.getDocument(`brandKits/${organizationId}`);
    return brandKit ? this.brandKitView(brandKit, organizationId) : null;
  }

  async patchBrandKit(user: FirebaseIdentity, dto: UpdateBrandKitDto): Promise<RecordValue> {
    const { organizationId } = await this.active(user, "brandKit.write");
    if (dto.logoAssetId) {
      const asset = await this.firebase.getDocument(`mediaAssets/${dto.logoAssetId}`);
      if (!asset || this.stringValue(asset.organizationId) !== organizationId) {
        throw new BadRequestException({ code: "invalid_logo_asset", message: "The logo must be a media asset owned by the active organization." });
      }
    }
    const existing = await this.firebase.getDocument(`brandKits/${organizationId}`);
    const now = new Date().toISOString();
    const brandKit = {
      ...(existing ?? {}), id: organizationId, organizationId,
      ...(dto.logoAssetId !== undefined ? { logoAssetId: dto.logoAssetId } : {}),
      ...(dto.colorPalette !== undefined ? { colorPalette: dto.colorPalette } : {}),
      ...(dto.fontFamilies !== undefined ? { fontFamilies: dto.fontFamilies } : {}),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    await this.firebase.putDocument(`brandKits/${organizationId}`, brandKit);
    await this.audit(user, organizationId, "brand_kit.update", "success", { fields: Object.keys(dto) });
    return this.brandKitView(brandKit, organizationId);
  }

  async getDraft(user: FirebaseIdentity): Promise<RecordValue> {
    const draft = await this.firebase.getDocument(`onboardingDrafts/${user.uid}`);
    return draft ?? { payload: {}, stepIndex: 0, validationByStep: {}, revision: "0" };
  }

  async putDraft(user: FirebaseIdentity, dto: OnboardingDraftDto): Promise<RecordValue> {
    const existing = await this.firebase.getDocument(`onboardingDrafts/${user.uid}`);
    if (existing && dto.revision && this.stringValue(existing.revision) !== dto.revision) throw new ConflictException({ code: "revision_conflict", message: "The onboarding draft is stale.", currentRevision: this.stringValue(existing.revision) });
    const now = new Date().toISOString(); const revision = randomUUID();
    const draft = { id: user.uid, userId: user.uid, payload: dto.payload, stepIndex: dto.stepIndex, validationByStep: dto.validationByStep ?? {}, revision, idempotencyKey: dto.idempotencyKey ?? "", updatedAt: now };
    await this.firebase.putDocument(`onboardingDrafts/${user.uid}`, draft);
    return draft;
  }

  async completeOnboarding(user: FirebaseIdentity): Promise<CreatedOrganizationResult> {
    const draft = await this.getDraft(user); const payload = (draft.payload ?? {}) as CreateOrganizationDto;
    if (!payload.name || typeof payload.name !== "string") throw new BadRequestException({ code: "onboarding_invalid", message: "Organization name is required." });
    const existingUser = await this.firebase.getDocument(`users/${user.uid}`);
    const result = await this.createOrganization(user, { ...payload, setupMode: payload.setupMode ?? "create" }, existingUser, true);
    await this.firebase.putDocument(`onboardingDrafts/${user.uid}`, { ...draft, status: "complete", completedAt: new Date().toISOString() });
    return result;
  }

  async invite(user: FirebaseIdentity, dto: InvitationDto): Promise<RecordValue> { const { organizationId } = await this.active(user, "users.manage"); if (!ROLES.includes(dto.role as never)) throw new BadRequestException({ code: "invalid_role", message: "The requested role is not supported." }); return this.job(user, organizationId, "invitation", { email: dto.email.toLowerCase(), role: dto.role }); }
  async socialHandoff(user: FirebaseIdentity, dto: SocialHandoffDto): Promise<RecordValue> { const { organizationId } = await this.active(user, "settings.manage"); const job = await this.job(user, organizationId, "social_handoff", { provider: dto.provider }); return { ...job, handoffUrl: `/api/v1/organizations/current/social-handoffs/${job.id}/start` }; }

  private async createOrganization(user: FirebaseIdentity, dto: CreateOrganizationDto, existingUser?: RecordValue, setupComplete = false): Promise<CreatedOrganizationResult> {
    const now = new Date().toISOString(); const organizationId = randomUUID(); const membershipId = `${organizationId}_${user.uid}`; const permissions = [...PERMISSIONS]; const revision = randomUUID();
    const organization = { id: organizationId, ...this.profileFields(dto), name: dto.name.trim(), setupComplete, onboardingStatus: setupComplete ? "complete" : "incomplete", subscriptionStatus: "TRIAL", timezone: dto.timezone?.trim() || "UTC", revision, createdBy: user.uid, createdAt: now, updatedAt: now, ...(dto.firstCampaignChoice === "defer" ? { firstCampaignDeferredAt: now, firstCampaignDeferredBy: user.uid } : {}) };
    const membership = { id: membershipId, organizationId, userId: user.uid, role: "ChurchAdministrator", status: "ACTIVE", permissions, createdAt: now, updatedAt: now };
    await this.firebase.putDocument(`organizations/${organizationId}`, organization); await this.firebase.putDocument(`memberships/${membershipId}`, membership); await this.firebase.putDocument(`users/${user.uid}`, { ...(existingUser ?? {}), uid: user.uid, email: existingUser?.email ?? user.email ?? "", displayName: existingUser?.displayName ?? user.name ?? "User", status: existingUser?.status ?? "ACTIVE", activeOrganizationId: organizationId, updatedAt: now });
    if (dto.firstCampaignChoice === "create") await this.job(user, organizationId, "campaign_draft", { source: "onboarding" });
    await this.audit(user, organizationId, "organization.create", "success", { setupMode: "create" });
    return { organization: this.profile(organization) as RecordValue & { id: string; name?: string }, membership: this.safeMembership(membership), role: membership.role, permissions, subscriptionStatus: "TRIAL", onboardingStatus: setupComplete ? "complete" : "incomplete", ...(dto.firstCampaignChoice === "create" ? { nextActionUrl: "/app/campaigns/new?source=onboarding" } : {}), recoveryMessages: [] };
  }

  private join(user: FirebaseIdentity, dto: CreateOrganizationDto): Promise<CreatedOrganizationResult> { void user; if (!dto.invitationCode?.trim()) throw new BadRequestException({ code: "invitation_code_required", message: "Invitation code is required to join an organization." }); return Promise.reject(new NotFoundException({ code: "invitation_not_found", message: "The invitation code is invalid or expired." })); }
  private async active(user: FirebaseIdentity, permission: string) {
    const { userId, userDoc } = await this.resolveInternalUser(user.uid);
    const organizationId = this.stringValue(userDoc?.activeOrganizationId) || this.stringValue(userDoc?.defaultOrganizationId);
    if (!organizationId) {
      this.logAccessDenied(userId, undefined, permission, undefined);
      throw new ForbiddenException({ code: "organization_context_missing", message: "Select an active organization before accessing this resource." });
    }

    const membership = await this.resolveMembership(organizationId, userId);
    const membershipStatus = this.stringValue(membership?.status);
    if (membershipStatus !== "ACTIVE" || !this.hasPermission(membership, permission)) {
      this.logAccessDenied(userId, organizationId, permission, membershipStatus || undefined);
      throw new ForbiddenException({ code: "organization_permission_missing", message: "An active organization membership with permission is required." });
    }
    const organization = await this.firebase.getDocument(`organizations/${organizationId}`);
    if (!organization) throw new NotFoundException({ code: "organization_not_found", message: "The active organization no longer exists." });
    return { organizationId, organization, membership };
  }

  private async resolveInternalUser(firebaseUid: string): Promise<{ userId: string; userDoc: RecordValue | undefined }> {
    const direct = await this.firebase.getDocument(`users/${firebaseUid}`);
    if (direct) return { userId: this.stringValue(direct.id) || firebaseUid, userDoc: direct };
    const [matched] = await this.firebase.queryDocuments("users", "firebaseUid", firebaseUid, "firebaseUid", "asc", 1);
    return { userId: this.stringValue(matched?.id) || firebaseUid, userDoc: matched };
  }

  private async resolveMembership(organizationId: string, userId: string): Promise<RecordValue | undefined> {
    const direct = await this.firebase.getDocument(`memberships/${organizationId}_${userId}`);
    if (direct && this.stringValue(direct.organizationId || organizationId) === organizationId && this.stringValue(direct.userId || userId) === userId) return direct;
    const candidates = await this.firebase.queryDocuments("memberships", "userId", userId, "userId", "asc", 100);
    return candidates.find((membership) => this.stringValue(membership.organizationId) === organizationId);
  }

  private logAccessDenied(userId: string, organizationId: string | undefined, requiredPermission: string, membershipStatus: string | undefined): void {
    if (process.env.NODE_ENV === "production") return;
    this.logger.warn({ event: "brand_kit.access_denied", userId, organizationId, requiredPermission, membershipStatus });
  }
  private hasPermission(membership: RecordValue | undefined, permission: string): boolean {
    const permissions = this.stringArray(membership?.permissions);
    const role = this.stringValue(membership?.role);
    return permissions.includes(permission)
      || permissions.includes("admin")
      || role === "ChurchAdministrator"
      || role === "SuperAdministrator";
  }
  private profileFields(dto: Partial<CreateOrganizationDto>) {
    const keys = ["slogan","description","seniorPastor","primaryColor","secondaryColor","headingFont","bodyFont","primaryLogo","secondaryLogo","contact","socialChannels","serviceDays","serviceTimes","bibleTranslation","ministryTone","statementOfFaith","doctrinalGuidelines","prohibitedContent","defaultHashtags","defaultFooter","teamInvitations","socialConnectionNotes","firstCampaignChoice"] as const;
    const fields = Object.fromEntries(keys.filter((key) => dto[key] !== undefined).map((key) => [key, typeof dto[key] === "string" ? this.stringValue(dto[key]) : dto[key]]));
    const contact = { ...(dto.contact ?? {}), ...Object.fromEntries((["physicalAddress", "digitalAddress", "phone", "email", "website"] as const).filter((key) => dto[key]?.trim()).map((key) => [key, dto[key]!.trim()])) };
    if (Object.keys(contact).length) fields.contact = contact;
    if (dto.hashtags !== undefined) fields.defaultHashtags = dto.hashtags;
    return fields;
  }
  private profile(org: RecordValue) { const { createdBy, ...safe } = org; void createdBy; return safe; }
  private brandKitView(brandKit: RecordValue, organizationId: string): RecordValue {
    return {
      id: this.stringValue(brandKit.id) || organizationId,
      organizationId,
      ...(this.stringValue(brandKit.logoAssetId) ? { logoAssetId: this.stringValue(brandKit.logoAssetId) } : {}),
      colorPalette: this.stringArray(brandKit.colorPalette),
      fontFamilies: this.stringArray(brandKit.fontFamilies),
    };
  }
  private safeMembership(m: RecordValue) { return { id: m.id, organizationId: m.organizationId, userId: m.userId, role: m.role, status: m.status, permissions: m.permissions }; }
  private async job(user: FirebaseIdentity, organizationId: string, type: string, payload: RecordValue) { const now = new Date().toISOString(); const id = randomUUID(); const job = { id, organizationId, type, status: "queued", progress: 0, retryable: true, payload, createdBy: user.uid, createdAt: now, updatedAt: now }; await this.firebase.putDocument(`asyncJobs/${id}`, job); await this.audit(user, organizationId, `${type}.queue`, "success", { type }); return { id, type, status: "queued", progress: 0, retryable: true, createdAt: now }; }
  private async audit(user: FirebaseIdentity, organizationId: string, action: string, outcome: string, summary: RecordValue) { const id = randomUUID(); await this.firebase.putDocument(`auditEvents/${id}`, { id, correlationId: requestContext.getStore()?.correlationId ?? "", actor: user.uid, organizationId, resource: action, outcome, summary, createdAt: new Date().toISOString() }); }
  private stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
  private stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
}
