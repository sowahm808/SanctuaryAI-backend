import type { NextFunction, Request, Response } from "express";

const VERSIONED_API_PREFIX = "/api/v1";

/**
 * Keeps original, unversioned API URLs working for clients that were deployed
 * before the API moved under /api/v1. Some auth clients call /auth directly.
 */
export function legacyApiPathMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.url === "/api" || request.url.startsWith("/api/")) {
    if (!request.url.startsWith(`${VERSIONED_API_PREFIX}/`)) {
      request.url = `${VERSIONED_API_PREFIX}${request.url.slice(4)}`;
    }
  } else if (request.url === "/auth" || request.url.startsWith("/auth/")) {
    request.url = `${VERSIONED_API_PREFIX}${request.url}`;
  }

  next();
}
