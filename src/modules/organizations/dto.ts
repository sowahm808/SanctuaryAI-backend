import { ArrayMaxSize, IsArray, IsEmail, IsHexColor, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Transform } from "class-transformer";

function stringArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function logo(value: unknown, alt: unknown, cropInstructions?: unknown): unknown {
  if (typeof value !== "string") return value;
  const fileName = value.trim();
  if (!fileName) return undefined;
  return {
    fileName,
    ...(typeof alt === "string" && alt.trim() ? { alt: alt.trim() } : {}),
    ...(typeof cropInstructions === "string" && cropInstructions.trim() ? { cropInstructions: cropInstructions.trim() } : {}),
  };
}

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
  @Transform(({ value, obj }) => { const form = obj as Record<string, unknown>; return logo(value, form.primaryLogoAlt, form.logoCropInstructions); }) @IsOptional() @IsObject() primaryLogo?: Record<string, unknown>;
  @Transform(({ value, obj }) => { const form = obj as Record<string, unknown>; return logo(value, form.secondaryLogoAlt); }) @IsOptional() @IsObject() secondaryLogo?: Record<string, unknown>;
  @IsOptional() @IsString() primaryLogoAlt?: string;
  @IsOptional() @IsString() secondaryLogoAlt?: string;
  @IsOptional() @IsString() logoCropInstructions?: string;
  @IsOptional() @IsObject() contact?: Record<string, unknown>;
  @IsOptional() @IsString() physicalAddress?: string;
  @IsOptional() @IsString() digitalAddress?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() website?: string;
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() socialChannels?: unknown[];
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() serviceDays?: unknown[];
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() serviceTimes?: unknown[];
  @IsOptional() @IsString() bibleTranslation?: string;
  @IsOptional() @IsString() ministryTone?: string;
  @IsOptional() @IsString() statementOfFaith?: string;
  @IsOptional() @IsString() doctrinalGuidelines?: string;
  @IsOptional() @IsString() prohibitedContent?: string;
  @IsOptional() @IsArray() defaultHashtags?: unknown[];
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() hashtags?: unknown[];
  @IsOptional() @IsString() defaultFooter?: string;
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() teamInvitations?: unknown[];
  @Transform(({ value }) => stringArray(value)) @IsOptional() @IsArray() socialConnectionNotes?: unknown[];
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

export class UpdateBrandKitDto {
  @IsOptional() @IsString() @MaxLength(128) logoAssetId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsHexColor({ each: true }) colorPalette?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true })
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} .,'_-]*$/u, { each: true }) fontFamilies?: string[];
}
