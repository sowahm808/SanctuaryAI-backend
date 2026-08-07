import { Type } from "class-transformer";
import { Allow, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

export class WorkflowListQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["createdAt", "updatedAt", "title", "name", "status"]) sort = "updatedAt";
  @IsOptional() @IsIn(["asc", "desc"]) direction: "asc" | "desc" = "desc";
  @IsOptional() @IsObject() filter?: Record<string, string>;
}
export class WorkflowMutationDto {
  @IsOptional() @IsString() expectedRevision?: string;
  @IsOptional() @IsString() revision?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsIn(["draft", "generating", "version_ready", "pending_approval", "in_review", "changes_requested", "approved", "rejected", "scheduled", "published", "failed", "cancelled"]) status?: string;
  @IsOptional() @IsObject() brief?: Record<string, unknown>;
  @IsOptional() @IsObject() draft?: Record<string, unknown>;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsString() changeSummary?: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() sourceRevision?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsArray() mentions?: string[];
  @IsOptional() @IsString() scheduledAt?: string;
  @Allow() metadata?: unknown;
}
