import { buildCollectionQuery, encodeCollectionCursor } from "../src/database/collection-query";

describe("Firestore collection query serializer", () => {
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
        { stringValue: "2026-08-07T00:00:00.000Z" },
        { referenceValue: "projects/demo/databases/(default)/documents/themes/theme-1" },
      ] } });
  });
});
