import { Body, Controller, Get, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { CreateOrganizationDto, InvitationDto, OnboardingDraftDto, PatchOrganizationDto, SocialHandoffDto, UpdateBrandKitDto } from "./dto";
import { CreatedOrganizationResult, OrganizationsService } from "./organizations.service";

@ApiTags("Organizations")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: "Create or join an organization for the authenticated user" })
  create(@CurrentUser() user: FirebaseIdentity, @Body() dto: CreateOrganizationDto): Promise<CreatedOrganizationResult> { return this.organizations.create(user, dto); }

  @Get("current")
  current(@CurrentUser() user: FirebaseIdentity): Promise<Record<string, unknown>> { return this.organizations.current(user); }

  @Patch("current")
  patchCurrent(@CurrentUser() user: FirebaseIdentity, @Body() dto: PatchOrganizationDto): Promise<Record<string, unknown>> { return this.organizations.patchCurrent(user, dto); }

  @Get("current/brand-kit")
  @ApiOperation({ summary: "Get the active organization's optional brand kit" })
  brandKit(@CurrentUser() user: FirebaseIdentity): Promise<Record<string, unknown> | null> { return this.organizations.brandKit(user); }

  @Patch("current/brand-kit")
  @ApiOperation({ summary: "Create or update the active organization's brand kit" })
  patchBrandKit(@CurrentUser() user: FirebaseIdentity, @Body() dto: UpdateBrandKitDto): Promise<Record<string, unknown>> { return this.organizations.patchBrandKit(user, dto); }

  @Post("current/invitations")
  invite(@CurrentUser() user: FirebaseIdentity, @Body() dto: InvitationDto): Promise<Record<string, unknown>> { return this.organizations.invite(user, dto); }

  @Post("current/social-handoffs")
  socialHandoff(@CurrentUser() user: FirebaseIdentity, @Body() dto: SocialHandoffDto): Promise<Record<string, unknown>> { return this.organizations.socialHandoff(user, dto); }

  @Get("onboarding-draft")
  getDraft(@CurrentUser() user: FirebaseIdentity): Promise<Record<string, unknown>> { return this.organizations.getDraft(user); }

  @Put("onboarding-draft")
  putDraft(@CurrentUser() user: FirebaseIdentity, @Body() dto: OnboardingDraftDto): Promise<Record<string, unknown>> { return this.organizations.putDraft(user, dto); }

  @Post("onboarding/complete")
  complete(@CurrentUser() user: FirebaseIdentity): Promise<CreatedOrganizationResult> { return this.organizations.completeOnboarding(user); }
}
