import { Type } from "class-transformer";
import { IsArray, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";
export class ThemeListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @IsIn(["createdAt", "updatedAt"])
  sort: "createdAt" | "updatedAt" = "updatedAt";

  @IsOptional() @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "desc";

  @IsOptional() @IsString()
  cursor?: string;
}
export class ThemeInputDto { @IsOptional() @IsIn(["themes"]) kind?: string; @IsOptional() @IsObject() brief?: Record<string, unknown>; @IsOptional() @IsString() date?: string; @IsOptional() @IsString() campaignId?: string; @IsOptional() @IsString() topic?: string; @IsOptional() @IsArray() scriptures?: unknown[]; @IsOptional() @IsString() spiritualEmphasis?: string; @IsOptional() @IsString() pastorNotes?: string; @IsOptional() @IsString() previousTheme?: string; @IsOptional() @IsArray() events?: unknown[]; @IsOptional() @IsString() tone?: string; @IsOptional() @IsString() audience?: string; @IsOptional() @IsString() bibleTranslation?: string; @IsOptional() @IsString() templateId?: string; }
export class ThemePatchInputDto extends ThemeInputDto { @IsDefined() revision!: string | number; @IsOptional() @IsString() idempotencyKey?: string; }
export class ThemeDraftUpdateDto extends ThemeInputDto { @IsDefined() expectedRevision!: string | number; @IsOptional() @IsObject() draft?: Record<string, unknown>; }
export class ThemeOutputDto { @IsDefined() revision!: string | number; @IsOptional() @IsObject() output?: Record<string, unknown>; @IsOptional() @IsString() changeSummary?: string; }
export class ThemeRefineDto { @IsIn(["prophetic","pastoral","simplify","add-scriptures","shorten","expand","alternative-generation"]) scope!: string; @IsOptional() @IsString() sourceRevision?: string; @IsOptional() @IsString() idempotencyKey?: string; @IsOptional() @IsArray() targetFields?: string[]; }
export class ThemeCommentDto { @IsString() body!: string; @IsOptional() @IsArray() mentions?: string[]; @IsOptional() resolved?: boolean; }
export class ThemeActionDto { @IsOptional() @IsString() revision?: string; @IsOptional() @IsString() feedback?: string; }
