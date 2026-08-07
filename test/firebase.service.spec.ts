import { ConfigService } from "@nestjs/config";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";

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
        new ServiceUnavailableException({
          code: "FIREBASE_ERROR",
          message: "Document not found.",
          firebaseStatus: "NOT_FOUND",
          firebaseStatusCode: 404,
        }),
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
      { id: "newest", organizationId: "org-1", updatedAt: "2026-08-03T00:00:00.000Z" },
      { id: "older", organizationId: "org-1", updatedAt: "2026-08-01T00:00:00.000Z" },
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
});
