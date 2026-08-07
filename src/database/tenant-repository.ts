import { Injectable } from "@nestjs/common";
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
    let items = await this.firebase.queryDocuments(collection, "organizationId", organizationId, sort, options.direction, 500);
    items = items.filter((item) => item.deletedAt === undefined || item.deletedAt === null);
    for (const [key, value] of Object.entries(options.filters ?? {})) items = items.filter((item) => typeof item[key] === "string" && item[key] === value);
    const term = options.search?.trim().toLocaleLowerCase();
    if (term) items = items.filter((item) => [item.title, item.name, item.displayName, item.email, item.topic].some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(term)));
    const total = items.length, offset = this.decodeCursor(options.cursor), page = items.slice(offset, offset + requested);
    return { items: page, nextCursor: offset + page.length < total ? this.encodeCursor(offset + page.length) : null, previousCursor: offset > 0 ? this.encodeCursor(Math.max(0, offset - requested)) : null, total };
  }
  private encodeCursor(offset: number) { return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url"); }
  private decodeCursor(cursor?: string) { if (!cursor) return 0; try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown }; return Math.max(0, Number(value.offset) || 0); } catch { return 0; } }
}
