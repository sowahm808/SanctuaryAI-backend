import { UnprocessableEntityException } from "@nestjs/common";

export type QueryDirection = "asc" | "desc";
export type FirestoreQueryValue =
  | { stringValue: string }
  | { timestampValue: string }
  | { referenceValue: string };

export interface CollectionQueryInput {
  collection: string;
  organizationId?: string;
  sort?: string;
  direction?: QueryDirection;
  limit: number;
  filters?: Readonly<Record<string, string>>;
  cursor?: string;
  projectId: string;
}

export interface CollectionCursor { value: string; id: string; }

const cursorValue = (sort: string, value: string): FirestoreQueryValue =>
  // Firestore cursors are typed. Encoding an ISO timestamp as stringValue
  // makes a timestamp orderBy cursor an INVALID_ARGUMENT on the next page.
  sort.endsWith("At") && !Number.isNaN(Date.parse(value))
    ? { timestampValue: value }
    : { stringValue: value };

const fieldFilter = (fieldPath: string, value: string) => ({
  fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } },
});

export const decodeCollectionCursor = (cursor: string): CollectionCursor => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CollectionCursor>;
    if (typeof decoded.value === "string" && typeof decoded.id === "string" && decoded.id) return decoded as CollectionCursor;
  } catch { /* normalized below */ }
  throw new UnprocessableEntityException({ code: "invalid_cursor", message: "The pagination cursor is invalid." });
};

export const encodeCollectionCursor = (cursor: CollectionCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

/** Produces Firestore REST StructuredQuery JSON; __name__ is a fieldPath and its cursor is a referenceValue. */
export const buildCollectionQuery = (input: CollectionQueryInput): Record<string, unknown> => {
  const direction = input.direction === "asc" ? "ASCENDING" : "DESCENDING";
  const filters = [
    ...(input.organizationId === undefined ? [] : [fieldFilter("organizationId", input.organizationId)]),
    ...Object.entries(input.filters ?? {}).map(([key, value]) => fieldFilter(key, value)),
  ];
  const query: Record<string, unknown> = {
    from: [{ collectionId: input.collection }],
    limit: input.limit + 1,
  };
  if (filters.length) query.where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  if (input.sort) query.orderBy = [
    { field: { fieldPath: input.sort }, direction },
    { field: { fieldPath: "__name__" }, direction },
  ];
  if (input.cursor) {
    if (!input.sort) throw new UnprocessableEntityException({ code: "invalid_cursor", message: "A pagination cursor requires a sort field." });
    const cursor = decodeCollectionCursor(input.cursor);
    query.startAt = { before: false, values: [
      cursorValue(input.sort, cursor.value),
      { referenceValue: `projects/${input.projectId}/databases/(default)/documents/${input.collection}/${cursor.id}` },
    ] satisfies FirestoreQueryValue[] };
  }
  return query;
};
