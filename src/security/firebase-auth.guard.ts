import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Request } from "express";
import {
  FirebaseIdentity,
  FirebaseService,
} from "../database/firebase.service";
import { createHash } from "node:crypto";

export interface AuthenticatedRequest extends Request {
  user?: FirebaseIdentity;
}

export const FIREBASE_SESSION_COOKIE = "__session";

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "");
    const cookieToken = (
      request.cookies as Record<string, unknown> | undefined
    )?.[FIREBASE_SESSION_COOKIE];
    const bearerToken = match?.[1];
    const sessionToken = typeof cookieToken === "string" ? cookieToken : undefined;
    const token = bearerToken ?? sessionToken;
    if (!token)
      throw new UnauthorizedException("A Firebase authentication token is required");
    request.user = bearerToken
      ? await this.firebase.verifyIdToken(bearerToken)
      : await this.resolveSessionCookie(token);
    return true;
  }

  private async resolveSessionCookie(token: string): Promise<FirebaseIdentity> {
    try {
      return await this.firebase.verifyIdToken(token);
    } catch (error) {
      const session = await this.firebase.getDocument(
        `sessions/${createHash("sha256").update(token).digest("hex")}`,
      );
      const expiresAt = Date.parse(this.stringValue(session?.expiresAt));
      const userId = this.stringValue(session?.userId);
      if (!session || !userId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw error;
      }
      const user = await this.firebase.getDocument(`users/${userId}`);
      return {
        uid: userId,
        email: this.stringValue(user?.email) || undefined,
        emailVerified: user?.emailVerified === true,
        name: this.stringValue(user?.displayName) || undefined,
        claims: {},
      };
    }
  }

  private stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FirebaseIdentity => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user)
      throw new UnauthorizedException("Authentication context is unavailable");
    return user;
  },
);
