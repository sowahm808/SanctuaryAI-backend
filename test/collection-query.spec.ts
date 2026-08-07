import { buildCollectionQuery, encodeCollectionCursor } from "../src/database/collection-query";

describe("Firestore collection query serializer", () => {
  it("serializes a minimal collection-only query with a numeric limit", () => {
    expect(buildCollectionQuery({ collection: "themes", limit: 0, projectId: "demo" })).toEqual({
      from: [{ collectionId: "themes" }],
      limit: 1,
    });
  });

  it.each(["asc", "desc"] as const)("serializes tenant ordering and the document-name tie breaker (%s)", (direction) => {
    const actual = buildCollectionQuery({ collection: "themes", organizationId: "org-1", sort: "updatedAt", direction, limit: 20, projectId: "demo" });
    expect(actual).toEqual({
      from: [{ collectionId: "themes" }],
      where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: "org-1" } } },
      orderBy: [
        { field: { fieldPath: "updatedAt" }, direction: direction === "asc" ? "ASCENDING" : "DESCENDING" },
        { field: { fieldPath: "__name__" }, direction: direction === "asc" ? "ASCENDING" : "DESCENDING" },
      ],
      limit: 21,
    });
  });

  it("serializes cursor values in order and uses a document reference for __name__", () => {
    const cursor = encodeCollectionCursor({ value: "2026-08-07T00:00:00.000Z", id: "theme-1" });
    expect(buildCollectionQuery({ collection: "themes", organizationId: "org-1", sort: "updatedAt", direction: "desc", limit: 20, cursor, projectId: "demo" }))
      .toMatchObject({ startAt: { before: false, values: [
        { timestampValue: "2026-08-07T00:00:00.000Z" },
        { referenceValue: "projects/demo/databases/(default)/documents/themes/theme-1" },
      ] } });
  });

  it("keeps string sort cursors typed as strings", () => {
    const cursor = encodeCollectionCursor({ value: "pending_approval", id: "approval-1" });
    expect(buildCollectionQuery({ collection: "approvals", organizationId: "org-1", sort: "status", direction: "asc", limit: 20, cursor, projectId: "demo" }))
      .toMatchObject({ startAt: { values: [
        { stringValue: "pending_approval" },
        { referenceValue: "projects/demo/databases/(default)/documents/approvals/approval-1" },
      ] } });
  });

  it("serializes multiple equality filters as an AND composite", () => {
    expect(buildCollectionQuery({ collection: "approvals", organizationId: "org-1", filters: { status: "pending", priority: "high" }, limit: 20, projectId: "demo" }))
      .toMatchObject({ where: { compositeFilter: { op: "AND", filters: [
        { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: "org-1" } } },
        { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } } },
        { fieldFilter: { field: { fieldPath: "priority" }, op: "EQUAL", value: { stringValue: "high" } } },
      ] } } });
  });
});
