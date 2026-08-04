import { IsArray, IsEmail, IsHexColor, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, Min, MinLength } from "class-validator";

export class CreateOrganizationDto {
  @IsOptional() @IsIn(["create", "join"]) setupMode?: "create" | "join";
  @IsOptional() @IsString() invitationCode?: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() @MinLength(2) timezone?: string;
  @IsOptional() @IsString() @MinLength(2) slogan?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MinLength(2) seniorPastor?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @IsOptional() @IsString() headingFont?: string;
  @IsOptional() @IsString() bodyFont?: string;
  @IsOptional() @IsObject() primaryLogo?: Record<string, unknown>;
  @IsOptional() @IsObject() secondaryLogo?: Record<string, unknown>;
  @IsOptional() @IsObject() contact?: Record<string, unknown>;
  @IsOptional() @IsArray() socialChannels?: unknown[];
  @IsOptional() @IsArray() serviceDays?: unknown[];
  @IsOptional() @IsArray() serviceTimes?: unknown[];
  @IsOptional() @IsString() bibleTranslation?: string;
  @IsOptional() @IsString() ministryTone?: string;
  @IsOptional() @IsString() statementOfFaith?: string;
  @IsOptional() @IsString() doctrinalGuidelines?: string;
  @IsOptional() @IsString() prohibitedContent?: string;
  @IsOptional() @IsArray() defaultHashtags?: unknown[];
  @IsOptional() @IsString() defaultFooter?: string;
  @IsOptional() @IsArray() teamInvitations?: unknown[];
  @IsOptional() @IsArray() socialConnectionNotes?: unknown[];
  @IsOptional() @IsIn(["create", "defer"]) firstCampaignChoice?: "create" | "defer";
}

export class OnboardingDraftDto {
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() revision?: string;
  @IsInt() @Min(0) @Max(10) stepIndex!: number;
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsObject() validationByStep?: Record<string, unknown>;
}

export class PatchOrganizationDto extends CreateOrganizationDto {
  @IsString() revision!: string;
}

export class InvitationDto { @IsEmail() email!: string; @IsString() role!: string; }
export class SocialHandoffDto { @IsString() provider!: string; @IsOptional() @IsUrl({ require_tld: false }) redirectUrl?: string; }
