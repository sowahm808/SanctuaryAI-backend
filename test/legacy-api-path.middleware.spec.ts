import type { NextFunction, Request, Response } from "express";
import { legacyApiPathMiddleware } from "../src/common/legacy-api-path.middleware";

describe("legacyApiPathMiddleware", () => {
  const rewrite = (url: string): { url: string; next: jest.Mock } => {
    const request = { url } as Request;
    const next = jest.fn() as NextFunction;

    legacyApiPathMiddleware(request, {} as Response, next);

    return { url: request.url, next: next as jest.Mock };
  };

  it("routes an unversioned login request to the versioned endpoint", () => {
    const result = rewrite("/auth/login");

    expect(result.url).toBe("/api/v1/auth/login");
    expect(result.next).toHaveBeenCalledTimes(1);
  });

  it("preserves query strings while rewriting auth requests", () => {
    expect(rewrite("/auth/me?include=permissions").url).toBe(
      "/api/v1/auth/me?include=permissions",
    );
  });

  it("does not rewrite already-versioned or unrelated requests", () => {
    expect(rewrite("/api/v1/auth/login").url).toBe("/api/v1/auth/login");
    expect(rewrite("/login").url).toBe("/login");
  });
});
