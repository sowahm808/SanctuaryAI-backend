import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
import { FirestoreRequestError } from "../src/database/firestore-request.error";

const token = (claims: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.`;
};

const config = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    },
  }) as ConfigService;

describe("FirebaseService authentication emulator support", () => {
  const values = {
    FIREBASE_PROJECT_ID: "demo-sanctuary",
    FIREBASE_API_KEY: "fake-api-key",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  };

  afterEach(() => jest.restoreAllMocks());

  it("uses the Auth emulator when refreshing a token", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: "id-token",
          refresh_token: "new-refresh-token",
          expires_in: "3600",
          user_id: "firebase-user",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      new FirebaseService(config(values)).refresh("refresh-token"),
    ).resolves.toMatchObject({
      idToken: "id-token",
      refreshToken: "new-refresh-token",
      localId: "firebase-user",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=fake-api-key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts a valid unsigned emulator ID token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const service = new FirebaseService(config(values));

    await expect(
      service.verifyIdToken(
        token({
          aud: values.FIREBASE_PROJECT_ID,
          iss: `https://securetoken.google.com/${values.FIREBASE_PROJECT_ID}`,
          sub: "firebase-user",
          iat: now - 1,
          exp: now + 3600,
          email: "user@example.com",
          email_verified: true,
        }),
      ),
    ).resolves.toMatchObject({
      uid: "firebase-user",
      email: "user@example.com",
      emailVerified: true,
    });
  });

  it("never accepts an unsigned token outside emulator mode", async () => {
    const now = Math.floor(Date.now() / 1000);
    const service = new FirebaseService(
      config({
        FIREBASE_PROJECT_ID: values.FIREBASE_PROJECT_ID,
        FIREBASE_API_KEY: values.FIREBASE_API_KEY,
      }),
    );

    await expect(
      service.verifyIdToken(
        token({
          aud: values.FIREBASE_PROJECT_ID,
          iss: `https://securetoken.google.com/${values.FIREBASE_PROJECT_ID}`,
          sub: "firebase-user",
          iat: now - 1,
          exp: now + 3600,
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects emulator tokens with invalid claims", async () => {
    const now = Math.floor(Date.now() / 1000);
    const service = new FirebaseService(config(values));

    await expect(
      service.verifyIdToken(
        token({
          aud: "another-project",
          iss: `https://securetoken.google.com/${values.FIREBASE_PROJECT_ID}`,
          sub: "firebase-user",
          iat: now - 1,
          exp: now + 3600,
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("creates a user profile when Firestore reports a missing document", async () => {
    const service = new FirebaseService(config(values));
    const identity = {
      uid: "new-user",
      email: "new@example.com",
      emailVerified: true,
      name: "New User",
      claims: {},
    };
    const firestoreRequest = jest
      .spyOn(service, "firestoreRequest")
      .mockRejectedValueOnce(
        new FirestoreRequestError(404, "NOT_FOUND", 404, "Document not found."),
      )
      .mockResolvedValueOnce({});

    await expect(service.ensureUserProfile(identity)).resolves.toBeUndefined();
    expect(firestoreRequest).toHaveBeenNthCalledWith(1, "users/new-user", {
      method: "GET",
    });
    expect(firestoreRequest).toHaveBeenNthCalledWith(
      2,
      "users/new-user",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("builds the production theme list query and preserves Firestore ordering", async () => {
    const service = new FirebaseService(config(values));
    const firestoreRequest = jest.spyOn(service, "firestoreRequest").mockResolvedValue([
      { document: { name: "projects/demo/databases/(default)/documents/themes/newest", fields: { organizationId: { stringValue: "org-1" }, updatedAt: { timestampValue: "2026-08-03T00:00:00.000Z" } } } },
      { document: { name: "projects/demo/databases/(default)/documents/themes/older", fields: { organizationId: { stringValue: "org-1" }, updatedAt: { timestampValue: "2026-08-01T00:00:00.000Z" } } } },
    ]);

    await expect(service.queryDocuments("themes", "organizationId", "org-1", "updatedAt", "desc", 20)).resolves.toEqual([
      { id: "newest", organizationId: "org-1", updatedAt: new Date("2026-08-03T00:00:00.000Z") },
      { id: "older", organizationId: "org-1", updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    expect(firestoreRequest).toHaveBeenCalledWith(":runQuery", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "themes" }],
        where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: "org-1" } } },
        orderBy: [{ field: { fieldPath: "updatedAt" }, direction: "DESCENDING" }],
        limit: 20,
      } }),
    }));
  });

  it("preserves a missing-index failure instead of sorting an unbounded collection in memory", async () => {
    const service = new FirebaseService(config(values));
    const firestoreRequest = jest.spyOn(service, "firestoreRequest")
      .mockRejectedValueOnce(new FirestoreRequestError(400, "FAILED_PRECONDITION", 400, "The query requires an index."));

    await expect(service.queryDocuments("themes", "organizationId", "org-1", "updatedAt", "desc", 2))
      .rejects.toMatchObject({ httpStatus: 400, firebaseStatus: "FAILED_PRECONDITION", firebaseMessage: "The query requires an index." });
    expect(firestoreRequest).toHaveBeenCalledTimes(1);
  });

  it("returns a stable Firestore cursor page in descending updatedAt order", async () => {
    const service = new FirebaseService(config(values));
    const firestoreRequest = jest.spyOn(service, "firestoreRequest").mockResolvedValue([
      { document: { name: "projects/demo/databases/(default)/documents/themes/newest", fields: { updatedAt: { stringValue: "2026-08-03T00:00:00.000Z" } } } },
      { document: { name: "projects/demo/databases/(default)/documents/themes/older", fields: { updatedAt: { stringValue: "2026-08-02T00:00:00.000Z" } } } },
    ]);

    const page = await service.queryDocumentsPage("themes", "organizationId", "org-1", "updatedAt", "desc", 1);

    expect(page.items).toEqual([{ id: "newest", updatedAt: "2026-08-03T00:00:00.000Z" }]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(firestoreRequest).toHaveBeenCalledWith(":runQuery", expect.objectContaining({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: expect.stringContaining('"direction":"DESCENDING"'),
    }));

    firestoreRequest.mockClear().mockResolvedValue([]);
    await service.queryDocumentsPage("themes", "organizationId", "org-1", "updatedAt", "desc", 1, page.nextCursor!);
    expect(firestoreRequest).toHaveBeenCalledWith(":runQuery", expect.objectContaining({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: expect.stringContaining('"timestampValue":"2026-08-03T00:00:00.000Z"'),
    }));
    expect(firestoreRequest).toHaveBeenCalledWith(":runQuery", expect.objectContaining({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: expect.stringContaining('"referenceValue":"projects/demo-sanctuary/databases/(default)/documents/themes/newest"'),
    }));
  });

  it("calls Firestore runQuery as an RPC on the documents resource", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const service = new FirebaseService(config({
      ...values,
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    }));

    await expect(
      service.queryDocuments("themes", "organizationId", "org-1", "updatedAt", "desc", 20),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/projects/demo-sanctuary/databases/(default)/documents:runQuery",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("preserves the complete Firebase error response in a typed internal error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 400,
      status: "INVALID_ARGUMENT",
      message: "StructuredQuery.orderBy is invalid.",
      details: [{ reason: "bad field reference" }],
    } }), { status: 400, statusText: "Bad Request", headers: { "content-type": "application/json" } }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));

    await expect(service.firestoreRequest(":runQuery", { method: "POST", body: "{}" })).rejects.toMatchObject({
      httpStatus: 400,
      firebaseStatus: "INVALID_ARGUMENT",
      firebaseCode: 400,
      firebaseMessage: "StructuredQuery.orderBy is invalid.",
      firebaseDetails: [{ reason: "bad field reference" }],
    });
  });

  it.each([
    ["INVALID_ARGUMENT", "example"],
    ["FAILED_PRECONDITION", "query requires an index"],
  ])("retains a %s Google error envelope", async (status, message) => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: 400, message, status } }), { status: 400, statusText: "Bad Request" }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
    await expect(service.firestoreRequest(":runQuery", { method: "POST", body: "{}" })).rejects.toMatchObject({
      httpStatus: 400, firebaseCode: 400, firebaseStatus: status, firebaseMessage: message,
    });
  });

  it("uses a plain-text Firebase error body when no JSON envelope exists", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("upstream rejected query", { status: 400, statusText: "Bad Request" }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
    await expect(service.firestoreRequest(":runQuery", { method: "POST", body: "{}" })).rejects.toMatchObject({
      httpStatus: 400, firebaseMessage: "upstream rejected query",
    });
  });

  it.each([
    ["{not-json", "{not-json"],
    ["", "Bad Request"],
  ])("preserves a malformed or empty Firebase response (%p)", async (raw, message) => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(raw, { status: 400, statusText: "Bad Request" }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
    await expect(service.firestoreRequest(":runQuery", { method: "POST", body: "{}" })).rejects.toMatchObject({
      httpStatus: 400, firebaseMessage: message,
    });
  });

  it.each([
    ["NOT_FOUND", 404],
    ["UNAVAILABLE", 503],
  ])("retains the %s provider classification", async (status, code) => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code, status, message: `${status} message` } }), { status: code }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
    await expect(service.firestoreRequest("themes/missing", { method: "GET" })).rejects.toMatchObject({
      httpStatus: code, firebaseStatus: status, firebaseCode: code, firebaseMessage: `${status} message`,
    });
  });

  it("encodes supported Firestore values and decodes timestamps as Date objects", () => {
    const service = new FirebaseService(config(values));
    const encodeValue = (service as unknown as { encodeValue(value: unknown): unknown }).encodeValue.bind(service);
    const decodeValue = (service as unknown as { decodeValue(value: unknown): unknown }).decodeValue.bind(service);
    const instant = new Date("2026-08-07T00:00:00Z");

    expect(encodeValue(instant)).toEqual({ timestampValue: "2026-08-07T00:00:00.000Z" });
    expect(encodeValue("text")).toEqual({ stringValue: "text" });
    expect(encodeValue(true)).toEqual({ booleanValue: true });
    expect(encodeValue(2)).toEqual({ integerValue: "2" });
    expect(encodeValue(2.5)).toEqual({ doubleValue: 2.5 });
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue([instant])).toEqual({ arrayValue: { values: [{ timestampValue: "2026-08-07T00:00:00.000Z" }] } });
    expect(encodeValue({ nested: { at: instant } })).toEqual({ mapValue: { fields: { nested: { mapValue: { fields: { at: { timestampValue: "2026-08-07T00:00:00.000Z" } } } } } } });
    expect(decodeValue({ timestampValue: "2026-08-07T00:00:00Z" })).toEqual(instant);
    expect(decodeValue({ timestampValue: "2026-08-07T00:00:00Z" })).toBeInstanceOf(Date);
  });

  it("rejects invalid dates, invalid timestamp payloads, and unsupported class instances", () => {
    const service = new FirebaseService(config(values));
    const encodeValue = (service as unknown as { encodeValue(value: unknown): unknown }).encodeValue.bind(service);
    const decodeValue = (service as unknown as { decodeValue(value: unknown): unknown }).decodeValue.bind(service);
    class Unsupported {}

    expect(() => encodeValue(new Date("invalid"))).toThrow("Cannot encode invalid Date");
    expect(() => encodeValue(new Unsupported())).toThrow("Cannot encode unsupported Firestore value");
    expect(() => decodeValue({ timestampValue: "invalid" })).toThrow("Cannot decode invalid Firestore timestamp");
  });

  it("places a subcollection parent in the runQuery endpoint rather than its body", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    const service = new FirebaseService(config({ ...values, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
    await service.queryDocuments("themes/theme-1/versions", "organizationId", "org-1", "createdAt", "desc", 1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/projects/demo-sanctuary/databases/(default)/documents/themes/theme-1:runQuery",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "versions" }],
        where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: "org-1" } } },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 1,
      } }) }),
    );
  });
});
