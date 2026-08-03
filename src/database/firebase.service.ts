import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createPrivateKey,
  createSign,
  createVerify,
  randomUUID,
} from "node:crypto";

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
  error?: { message?: string };
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

const encode = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

@Injectable()
export class FirebaseService {
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
    const body = (await response.json()) as T & FirebaseError;
    if (!response.ok) {
      const message = body.error?.message ?? "Firebase request failed";
      throw new ServiceUnavailableException({
        code: "FIREBASE_ERROR",
        message,
      });
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
    return this.json<T>(
      `${base}/projects/${this.projectId}/databases/(default)/documents/${path}`,
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
    const response = await this.json<FirebaseRefreshResponse>(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.apiKey)}`,
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

  async verifyIdToken(token: string): Promise<FirebaseIdentity> {
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
    if (header.alg !== "RS256" || !header.kid)
      throw new UnauthorizedException("Invalid Firebase ID token");
    const certs = await this.googleCertificates();
    const certificate = certs[header.kid];
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    const now = Math.floor(Date.now() / 1000);
    const valid =
      certificate &&
      verifier.verify(certificate, parts[2], "base64url") &&
      claims.aud === this.projectId &&
      claims.iss === `https://securetoken.google.com/${this.projectId}` &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0 &&
      Number(claims.exp) > now &&
      Number(claims.iat) <= now;
    if (!valid) throw new UnauthorizedException("Invalid Firebase ID token");
    return {
      uid: claims.sub as string,
      email: typeof claims.email === "string" ? claims.email : undefined,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" ? claims.name : undefined,
      claims,
    };
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

  async health(): Promise<void> {
    await this.firestoreRequest(`health/${randomUUID()}`, {
      method: "GET",
    }).catch((error: unknown) => {
      if (
        error instanceof ServiceUnavailableException &&
        JSON.stringify(error.getResponse()).includes("NOT_FOUND")
      )
        return;
      throw error;
    });
  }
}
