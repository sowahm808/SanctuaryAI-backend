import { Type } from "class-transformer";
import { IsArray, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class CampaignDraftDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
  @Type(() => Number) @IsInt() @Min(2020) @Max(2100) year!: number;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class CreateCampaignDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() focus?: string;
  @IsOptional() @IsString() spiritualFocus?: string;
  @IsOptional() @IsString() scripture?: string;
  @IsOptional() @IsArray() scriptures?: unknown[];
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) prayerQuantity?: number;
  @IsOptional() @IsString() bibleTranslation?: string;
}

export class CampaignWizardDto {
  @IsString() revision!: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() spiritualFocus?: string;
  @IsOptional() @IsArray() scriptures?: unknown[];
  @IsOptional() @IsArray() sundays?: unknown[];
  @IsOptional() @IsArray() events?: unknown[];
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) prayerQuantity?: number;
  @IsOptional() @IsString() bibleTranslation?: string;
}

export class DuplicateCampaignDto extends CampaignDraftDto {}

export class SectionMutationDto {
  @IsString() revision!: string;
  @IsOptional() @IsString() changeSummary?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsString() candidateVersionId?: string;
}

export class SectionActionDto {
  @IsOptional() @IsString() revision?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() reviewerUserId?: string;
}

export class GenerateDto {
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() sourceRevision?: string;
  @IsOptional() @IsString() revision?: string;
}
