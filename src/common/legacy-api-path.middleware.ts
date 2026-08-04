import type { NextFunction, Request, Response } from "express";

const VERSIONED_API_PREFIX = "/api/v1";

/**
 * Keeps the original, unversioned authentication URLs working for clients
 * that were deployed before the API was moved under /api/v1.
 */
export function legacyApiPathMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.url === "/auth" || request.url.startsWith("/auth/")) {
    request.url = `${VERSIONED_API_PREFIX}${request.url}`;
  }

  next();
}
