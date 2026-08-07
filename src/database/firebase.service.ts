import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createPrivateKey,
  createSign,
  createVerify,
  randomUUID,
} from "node:crypto";
import { buildCollectionQuery, encodeCollectionCursor } from "./collection-query";
import { FirestoreRequestError } from "./firestore-request.error";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}
interface FirebaseRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}
interface FirebaseError {
  error?: { code?: number; message?: string; status?: string; details?: unknown };
}
interface FirebaseAuthResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email?: string;
  displayName?: string;
}
export interface FirebaseIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  claims: Readonly<Record<string, unknown>>;
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreQueryResult {
  document?: FirestoreDocument;
}

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

const encode = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private accessToken?: { value: string; expiresAt: number };
  private certificates?: {
    values: Readonly<Record<string, string>>;
    expiresAt: number;
  };

  constructor(private readonly config: ConfigService) {}

  private get projectId(): string {
    return this.config.getOrThrow<string>("FIREBASE_PROJECT_ID");
  }
  private get apiKey(): string {
    return this.config.getOrThrow<string>("FIREBASE_API_KEY");
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    const raw = await response.text();
    let body: T & FirebaseError;
    let parsed = false;
    try {
      body = (raw ? JSON.parse(raw) : {}) as T & FirebaseError;
      parsed = raw.length > 0;
    } catch {
      body = {} as T & FirebaseError;
    }
    if (!response.ok) {
      const provider = body.error;
      const failure = {
        httpStatus: response.status,
        firebaseStatus: provider?.status,
        firebaseCode: provider?.code,
        firebaseMessage: provider?.message ?? (!parsed && raw.trim() ? raw.trim() : undefined) ?? response.statusText ?? "Unknown Firebase error",
        firebaseDetails: provider?.details,
      };
      this.logger.error({ event: "firebase.request_failed", ...failure });
      throw new FirestoreRequestError(failure.httpStatus, failure.firebaseStatus, failure.firebaseCode, failure.firebaseMessage, failure.firebaseDetails);
    }
    return body;
  }

  private async serviceAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000)
      return this.accessToken.value;
    const email = this.config.getOrThrow<string>("FIREBASE_CLIENT_EMAIL");
    const privateKey = this.config
      .getOrThrow<string>("FIREBASE_PRIVATE_KEY")
      .replace(/\\n/g, "\n");
    const now = Math.floor(Date.now() / 1000);
    const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = encode(
      JSON.stringify({
        iss: email,
        sub: email,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope: "https://www.googleapis.com/auth/datastore",
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const assertion = `${header}.${payload}.${signer.sign(createPrivateKey(privateKey), "base64url")}`;
    const token = await this.json<GoogleTokenResponse>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      },
    );
    this.accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return token.access_token;
  }

  async firestoreRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const emulator = this.config.get<string>("FIRESTORE_EMULATOR_HOST");
    const base = emulator
      ? `http://${emulator}/v1`
      : "https://firestore.googleapis.com/v1";
    const authorization = emulator
      ? "Bearer owner"
      : `Bearer ${await this.serviceAccessToken()}`;
    const documentsUrl = `${base}/projects/${this.projectId}/databases/(default)/documents`;
    // Firestore RPC endpoints use a colon suffix on the documents resource
    // (for example, `documents:runQuery`), not a child path such as
    // `documents/:runQuery`.
    const url = path.startsWith(":")
      ? `${documentsUrl}${path}`
      : `${documentsUrl}/${path}`;
    if (url.endsWith(":runQuery") && (this.config.get<string>("NODE_ENV") ?? process.env.NODE_ENV) !== "production") {
      let structuredQueryBody: unknown = init?.body;
      if (typeof init?.body === "string") {
        try { structuredQueryBody = JSON.parse(init.body) as unknown; } catch { /* retain text for diagnostics */ }
      }
      this.logger.debug({
        event: "firestore.request",
        method: init?.method ?? "GET",
        endpoint: url,
        body: structuredQueryBody,
      });
    }
    return this.json<T>(
      url,
      {
        ...init,
        headers: {
          authorization,
          "content-type": "application/json",
          ...init?.headers,
        },
      },
    );
  }

  async signUp(
    email: string,
    password: string,
    displayName: string,
  ): Promise<FirebaseAuthResponse> {
    const result = await this.identity<FirebaseAuthResponse>(
      "accounts:signUp",
      { email, password, displayName, returnSecureToken: true },
    );
    await this.setAccountInfo(result.idToken, { displayName });
    return result;
  }

  signIn(email: string, password: string): Promise<FirebaseAuthResponse> {
    return this.identity("accounts:signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    });
  }

  async refresh(refreshToken: string): Promise<FirebaseAuthResponse> {
    const emulator = this.config.get<string>("FIREBASE_AUTH_EMULATOR_HOST");
    const base = emulator
      ? `http://${emulator}/securetoken.googleapis.com/v1`
      : "https://securetoken.googleapis.com/v1";
    const response = await this.json<FirebaseRefreshResponse>(
      `${base}/token?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    return {
      idToken: response.id_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
      localId: response.user_id,
    };
  }

  sendPasswordReset(email: string): Promise<unknown> {
    return this.identity("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email,
    });
  }
  sendVerification(idToken: string): Promise<unknown> {
    return this.identity("accounts:sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken,
    });
  }

  resetPassword(oobCode: string, newPassword: string): Promise<unknown> {
    return this.identity("accounts:resetPassword", { oobCode, newPassword });
  }

  verifyEmail(oobCode: string): Promise<unknown> {
    return this.identity("accounts:update", { oobCode });
  }
  private setAccountInfo(
    idToken: string,
    fields: Record<string, unknown>,
  ): Promise<unknown> {
    return this.identity("accounts:update", {
      idToken,
      returnSecureToken: false,
      ...fields,
    });
  }
  private identity<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const emulator = this.config.get<string>("FIREBASE_AUTH_EMULATOR_HOST");
    const base = emulator
      ? `http://${emulator}/identitytoolkit.googleapis.com/v1`
      : "https://identitytoolkit.googleapis.com/v1";
    return this.json<T>(
      `${base}/${method}?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  async verifyIdToken(token: string, checkRevoked = false): Promise<FirebaseIdentity> {
    const parts = token.split(".");
    if (parts.length !== 3)
      throw new UnauthorizedException("Invalid Firebase ID token");
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(
        Buffer.from(parts[0], "base64url").toString(),
      ) as typeof header;
      claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString(),
      ) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException("Invalid Firebase ID token");
    }
    const emulator = this.config.get<string>("FIREBASE_AUTH_EMULATOR_HOST");
    let signatureValid = false;
    if (emulator) {
      // The Auth emulator deliberately issues unsigned JWTs. Only trust that
      // format when the emulator has been explicitly configured.
      signatureValid = header.alg === "none" && parts[2] === "";
    } else if (header.alg === "RS256" && header.kid) {
      const certs = await this.googleCertificates();
      const certificate = certs[header.kid];
      if (certificate) {
        const verifier = createVerify("RSA-SHA256");
        verifier.update(`${parts[0]}.${parts[1]}`);
        signatureValid = verifier.verify(certificate, parts[2], "base64url");
      }
    }
    const now = Math.floor(Date.now() / 1000);
    const valid =
      signatureValid &&
      claims.aud === this.projectId &&
      claims.iss === `https://securetoken.google.com/${this.projectId}` &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0 &&
      Number(claims.exp) > now &&
      Number(claims.iat) <= now;
    if (!valid) throw new UnauthorizedException("Invalid Firebase ID token");
    if (checkRevoked && !emulator) {
      await this.assertTokenNotRevoked(token, claims);
    }
    return {
      uid: claims.sub as string,
      email: typeof claims.email === "string" ? claims.email : undefined,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" ? claims.name : undefined,
      claims,
    };
  }

  private async assertTokenNotRevoked(
    idToken: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    const authTime = Number(claims.auth_time);
    if (!Number.isFinite(authTime))
      throw new UnauthorizedException("Invalid Firebase ID token");
    const result = await this.identity<{
      users?: Array<{ validSince?: string }>;
    }>("accounts:lookup", { idToken });
    const validSince = Number(result.users?.[0]?.validSince ?? 0);
    if (validSince && authTime < validSince)
      throw new UnauthorizedException("Invalid Firebase ID token");
  }

  private async googleCertificates(): Promise<
    Readonly<Record<string, string>>
  > {
    if (this.certificates && this.certificates.expiresAt > Date.now())
      return this.certificates.values;
    const response = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        "Firebase token verification is unavailable",
      );
    const values = (await response.json()) as Record<string, string>;
    const maxAge = /max-age=(\d+)/.exec(
      response.headers.get("cache-control") ?? "",
    )?.[1];
    this.certificates = {
      values,
      expiresAt: Date.now() + Number(maxAge ?? 300) * 1000,
    };
    return values;
  }

  async createUserProfile(
    identity: FirebaseIdentity,
    displayName: string,
  ): Promise<void> {
    await this.firestoreRequest(`users/${identity.uid}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          uid: { stringValue: identity.uid },
          email: { stringValue: identity.email ?? "" },
          normalizedEmail: {
            stringValue: (identity.email ?? "").toLowerCase(),
          },
          displayName: { stringValue: displayName },
          status: { stringValue: "ACTIVE" },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
  }

  async ensureUserProfile(identity: FirebaseIdentity): Promise<void> {
    try {
      await this.firestoreRequest(`users/${identity.uid}`, { method: "GET" });
    } catch (error: unknown) {
      if (
        error instanceof FirestoreRequestError &&
        this.isFirebaseNotFound(error)
      ) {
        await this.createUserProfile(identity, identity.name?.trim() || "User");
        return;
      }
      throw error;
    }
  }

  async getDocument(path: string): Promise<Record<string, unknown> | undefined> {
    try {
      const document = await this.firestoreRequest<FirestoreDocument>(path, {
        method: "GET",
      });
      return this.decodeFields(document.fields ?? {});
    } catch (error: unknown) {
      if (
        error instanceof FirestoreRequestError &&
        this.isFirebaseNotFound(error)
      )
        return undefined;
      throw error;
    }
  }

  async queryDocuments(
    collection: string,
    field: string,
    value: string,
    sort: string,
    direction: "asc" | "desc",
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where = {
      fieldFilter: {
        field: { fieldPath: field },
        op: "EQUAL",
        value: { stringValue: value },
      },
    };
    const results = await this.runCollectionQuery(collection, {
        from: [{ collectionId: collection.split("/").at(-1)! }],
        where,
        orderBy: [{
          field: { fieldPath: sort },
          direction: direction === "asc" ? "ASCENDING" : "DESCENDING",
        }],
        limit,
      });
    return this.decodeQueryResults(results);
  }

  async queryDocumentsPage(
    collection: string,
    field: string,
    value: string,
    sort: string,
    direction: "asc" | "desc",
    limit: number,
    cursor?: string,
    filters: Readonly<Record<string, string>> = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null; previousCursor: null; total: number }> {
    const structuredQuery = buildCollectionQuery({ collection, organizationId: value, sort, direction, limit, cursor, filters, projectId: this.projectId });
    const decoded = this.decodeQueryResults(await this.runQuery(structuredQuery));
    const hasMore = decoded.length > limit;
    const items = decoded.slice(0, limit);
    const last = items.at(-1), lastValue = last?.[sort], lastId = last?.id;
    const nextCursor = hasMore && typeof lastValue === "string" && typeof lastId === "string"
      ? encodeCollectionCursor({ value: lastValue, id: lastId })
      : null;
    return { items, nextCursor, previousCursor: null, total: items.length };
  }

  private runQuery(structuredQuery: Record<string, unknown>): Promise<FirestoreQueryResult[]> {
    return this.firestoreRequest<FirestoreQueryResult[]>(":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    });
  }

  private runCollectionQuery(collection: string, structuredQuery: Record<string, unknown>): Promise<FirestoreQueryResult[]> {
    const segments = collection.split("/").filter(Boolean);
    if (segments.length === 1) return this.runQuery(structuredQuery);
    if (segments.length % 2 === 0) throw new UnprocessableEntityException({ code: "invalid_collection_path", message: "The collection path is invalid." });
    // The parent is part of the runQuery resource name, not a request-body
    // property. Google rejects an otherwise valid StructuredQuery when a
    // `parent` sibling is included in the JSON payload.
    const parentPath = segments.slice(0, -1).join("/");
    return this.firestoreRequest<FirestoreQueryResult[]>(`${parentPath}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    });
  }

  private decodeQueryResults(results: FirestoreQueryResult[]): Record<string, unknown>[] {
    return results.flatMap(({ document }) => {
      if (!document) return [];
      const decoded = this.decodeFields(document.fields ?? {});
      const id = document.name?.split("/").pop();
      return [{ ...(id && !("id" in decoded) ? { id } : {}), ...decoded }];
    });
  }

  async putDocument(path: string, fields: Record<string, unknown>): Promise<void> {
    await this.firestoreRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: this.encodeFields(fields) }),
    });
  }

  async deleteDocument(path: string): Promise<void> {
    try {
      await this.firestoreRequest(path, { method: "DELETE" });
    } catch (error: unknown) {
      if (
        error instanceof FirestoreRequestError &&
        this.isFirebaseNotFound(error)
      )
        return;
      throw error;
    }
  }

  private encodeFields(fields: Record<string, unknown>): Record<string, FirestoreValue> {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, this.encodeValue(value)]),
    );
  }

  private encodeValue(value: unknown): FirestoreValue {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map((item) => this.encodeValue(item)) } };
    }
    if (typeof value === "object") {
      return { mapValue: { fields: this.encodeFields(value as Record<string, unknown>) } };
    }
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "bigint" || typeof value === "symbol") return { stringValue: value.toString() };
    return { stringValue: "" };
  }

  private decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, this.decodeValue(value)]),
    );
  }

  private decodeValue(value: FirestoreValue): unknown {
    if ("stringValue" in value) return value.stringValue;
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("nullValue" in value) return null;
    if ("mapValue" in value) return this.decodeFields(value.mapValue.fields ?? {});
    return (value.arrayValue.values ?? []).map((item) => this.decodeValue(item));
  }

  async health(): Promise<void> {
    await this.firestoreRequest(`health/${randomUUID()}`, {
      method: "GET",
    }).catch((error: unknown) => {
      if (
        error instanceof FirestoreRequestError &&
        this.isFirebaseNotFound(error)
      )
        return;
      throw error;
    });
  }

  private isFirebaseNotFound(error: FirestoreRequestError): boolean {
    return error.firebaseStatus === "NOT_FOUND" || error.httpStatus === 404;
  }
}
