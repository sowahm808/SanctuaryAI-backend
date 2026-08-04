import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { FirebaseService } from "../../database/firebase.service";
import { LoginDto, RegisterDto } from "./dto";
import {
  AuthResult,
  AuthSession,
  PERMISSIONS,
  Permission,
  ROLES,
  Role,
} from "./auth.types";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly firebase: FirebaseService) {}

  async register(dto: RegisterDto) {
    const response = await this.firebase.signUp(
      dto.email.trim().toLowerCase(),
      dto.password,
      dto.displayName.trim(),
    );
    const identity = await this.firebase.verifyIdToken(response.idToken);
    await this.firebase.createUserProfile(identity, dto.displayName.trim());
    await this.firebase.sendVerification(response.idToken);
    return this.authResponse(response, identity);
  }

  async login(dto: LoginDto) {
    try {
      const response = await this.firebase.signIn(
        dto.email.trim().toLowerCase(),
        dto.password,
      );
      const identity = await this.firebase.verifyIdToken(response.idToken);
      return this.authResponse(response, identity);
    } catch {
      throw new UnauthorizedException("Invalid credentials");
    }
  }

  async loginWithFirebase(idToken: string) {
    return this.exchangeFirebaseToken(idToken);
  }

  async exchangeFirebaseToken(idToken: string): Promise<{
    result: AuthResult;
    sessionToken?: string;
  }> {
    const identity = await this.firebase.verifyIdToken(idToken);
    await this.firebase.ensureUserProfile(identity);
    if (!identity.emailVerified) {
      return { result: { status: "verification_required" } };
    }

    const session = await this.projectSession(identity.uid, identity);
    const sessionToken = randomBytes(32).toString("base64url");
    const now = Date.now();
    await this.firebase.putDocument(`sessions/${this.sessionKey(sessionToken)}`, {
      userId: identity.uid,
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    return {
      result: { status: "authenticated", session },
      sessionToken,
    };
  }

  async restoreSession(token: string): Promise<AuthSession> {
    if (!token) throw new UnauthorizedException("A valid session is required");
    const path = `sessions/${this.sessionKey(token)}`;
    const record = await this.firebase.getDocument(path);
    const expiresAt = Date.parse(this.stringValue(record?.expiresAt));
    if (!record || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      if (record) await this.firebase.deleteDocument(path);
      throw new UnauthorizedException("A valid session is required");
    }
    const userId = this.stringValue(record.userId);
    if (!userId) throw new UnauthorizedException("A valid session is required");
    const session = await this.projectSession(userId);
    await this.firebase.putDocument(path, {
      ...record,
      lastSeenAt: new Date().toISOString(),
    });
    return session;
  }

  async logout(token: string): Promise<void> {
    if (token) await this.firebase.deleteDocument(`sessions/${this.sessionKey(token)}`);
  }

  async refresh(refreshToken: string) {
    const response = await this.firebase.refresh(refreshToken);
    const identity = await this.firebase.verifyIdToken(response.idToken);
    return this.authResponse(response, identity);
  }

  async forgotPassword(email: string) {
    try {
      await this.firebase.sendPasswordReset(email.trim().toLowerCase());
    } catch {
      /* Enumeration-safe by design. */
    }
    return { accepted: true };
  }

  resendVerification(idToken: string) {
    return this.firebase
      .sendVerification(idToken)
      .then(() => ({ accepted: true }));
  }

  private authResponse(
    response: { idToken: string; refreshToken: string; expiresIn: string },
    identity: {
      uid: string;
      email?: string;
      emailVerified: boolean;
      name?: string;
    },
  ) {
    return {
      user: identity,
      tokens: {
        accessToken: response.idToken,
        refreshToken: response.refreshToken,
        expiresIn: Number(response.expiresIn),
      },
    };
  }

  private sessionKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async projectSession(
    userId: string,
    identity?: { email?: string; name?: string },
  ): Promise<AuthSession> {
    const user = await this.firebase.getDocument(`users/${userId}`);
    const organizationId = this.stringValue(user?.activeOrganizationId);
    if (!organizationId) {
      return {
        user: this.sessionUser(userId, user, identity, []),
        role: null,
        organizationId: null,
        organizationName: null,
        organizationSetupComplete: false,
        subscriptionActive: false,
      };
    }
    const membership = await this.firebase.getDocument(
      `memberships/${organizationId}_${userId}`,
    );
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("No active organization membership");
    }
    const organization = await this.firebase.getDocument(
      `organizations/${organizationId}`,
    );
    if (!organization) throw new ForbiddenException("Organization is unavailable");
    const roleValue = this.stringValue(membership.role);
    if (!ROLES.includes(roleValue as Role)) {
      throw new ForbiddenException("Membership role is not supported");
    }
    const permissions = Array.isArray(membership.permissions)
      ? [...new Set(membership.permissions)]
          .filter((value): value is Permission =>
            typeof value === "string" && PERMISSIONS.includes(value as Permission),
          )
      : [];
    const subscriptionStatus = this.stringValue(organization.subscriptionStatus);
    return {
      user: this.sessionUser(userId, user, identity, permissions),
      role: roleValue as Role,
      organizationId,
      organizationName: this.stringValue(organization.name),
      organizationSetupComplete: organization.setupComplete === true,
      subscriptionActive: ["ACTIVE", "TRIAL", "GRACE"].includes(subscriptionStatus),
    };
  }

  private sessionUser(
    userId: string,
    user: Record<string, unknown> | undefined,
    identity: { email?: string; name?: string } | undefined,
    permissions: Permission[],
  ): AuthSession["user"] {
    return {
      id: userId,
      name: this.stringValue(user?.displayName) || identity?.name || "User",
      email: this.stringValue(user?.email) || identity?.email || "",
      ...(typeof user?.avatarUrl === "string" && user.avatarUrl
        ? { avatarUrl: user.avatarUrl }
        : {}),
      permissions,
    };
  }

  private stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }
}
