import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { FirebaseService } from "./firebase.service";

export interface TenantListOptions { limit: number; sort: string; direction: "asc" | "desc"; cursor?: string; search?: string; filters?: Record<string, string>; allowedSorts: readonly string[]; }
export interface TenantPage<T = Record<string, unknown>> { items: T[]; nextCursor: string | null; previousCursor: string | null; total: number; }

/** Small query boundary that makes tenant scope mandatory for collection reads. */
@Injectable()
export class TenantRepository {
  constructor(private readonly firebase: FirebaseService) {}
  async list(collection: string, organizationId: string, options: TenantListOptions): Promise<TenantPage> {
    if (!organizationId) throw new Error("tenant_repository_requires_organization_id");
    const sort = options.allowedSorts.includes(options.sort) ? options.sort : options.allowedSorts[0];
    const requested = Math.max(1, Math.min(100, options.limit));
    if (options.search?.trim()) throw new UnprocessableEntityException({ code: "search_not_supported", message: "Search is not supported for this collection." });
    return this.firebase.queryDocumentsPage(collection, "organizationId", organizationId, sort, options.direction, requested, options.cursor, options.filters);
  }
}
