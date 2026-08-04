import type { NextFunction, Request, Response } from "express";

const VERSIONED_API_PREFIX = "/api/v1";

/**
 * Keeps the original, unversioned authentication URLs working for clients
 * that were deployed before the API was moved under /api/v1. Some clients
 * include the old `/api` prefix while others call `/auth` directly.
 */
export function legacyApiPathMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.url === "/api/auth" || request.url.startsWith("/api/auth/")) {
    request.url = `${VERSIONED_API_PREFIX}${request.url.slice(4)}`;
  } else if (request.url === "/auth" || request.url.startsWith("/auth/")) {
    request.url = `${VERSIONED_API_PREFIX}${request.url}`;
  }

  next();
}
