import { TenantDocument } from './models';

export interface QueryOptions { includeDeleted?: boolean; limit?: number; cursor?: string; }
export interface FirestoreLike { collection(path: string): { where(field: string, op: string, value: unknown): unknown; }; }

export class TenantRepository<T extends TenantDocument> {
  private readonly documentType?: T;

  constructor(private readonly db: FirestoreLike, private readonly collectionName: string) {}

  queryForOrganization(organizationId: string, options: QueryOptions = {}): unknown {
    let query = this.db.collection(this.collectionName).where('organizationId', '==', organizationId);
    if (!options.includeDeleted) query = (query as { where(field: string, op: string, value: unknown): unknown }).where('deletedAt', '==', null);
    return query;
  }
}
