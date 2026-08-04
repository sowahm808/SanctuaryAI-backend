import { BadRequestException, Injectable, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import { FIREBASE_SESSION_COOKIE } from "../security/firebase-auth.guard";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    if (!this.requiresOriginCheck(request)) {
      next();
      return;
    }

    const candidate = this.requestOrigin(request);
    const allowed = this.allowedOrigins();

    if (!candidate || !allowed.includes(candidate)) {
      throw new BadRequestException({
        code: "csrf_origin_invalid",
        message: "The request could not be completed.",
      });
    }

    next();
  }

  private requiresOriginCheck(request: Request): boolean {
    if (!MUTATION_METHODS.has(request.method.toUpperCase())) return false;
    if (this.hasBearerToken(request)) return false;
    return typeof this.sessionCookie(request) === "string";
  }

  private hasBearerToken(request: Request): boolean {
    return /^Bearer\s+\S+/i.test(request.header("authorization") ?? "");
  }

  private sessionCookie(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)?.[
      FIREBASE_SESSION_COOKIE
    ];
  }

  private requestOrigin(request: Request): string {
    const origin = request.header("origin")?.trim();
    if (origin) return origin;

    const referer = request.header("referer")?.trim();
    if (!referer) return "";

    try {
      return new URL(referer).origin;
    } catch {
      return "";
    }
  }

  private allowedOrigins(): string[] {
    return this.config
      .getOrThrow<string>("CORS_ORIGINS")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
}
