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
    const token =
      match?.[1] ??
      (typeof cookieToken === "string" ? cookieToken : undefined);
    if (!token)
      throw new UnauthorizedException("A Firebase authentication token is required");
    request.user = await this.firebase.verifyIdToken(token);
    return true;
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
