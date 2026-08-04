import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import { CsrfOriginMiddleware } from "../src/common/csrf-origin.middleware";
import { FIREBASE_SESSION_COOKIE } from "../src/security/firebase-auth.guard";

function request(overrides: Partial<Request>): Request {
  const headers = (overrides.headers ?? {}) as Record<string, string>;
  return {
    method: "POST",
    cookies: { [FIREBASE_SESSION_COOKIE]: "session-token" },
    header: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as Request;
}

describe("CsrfOriginMiddleware", () => {
  const middleware = new CsrfOriginMiddleware({ getOrThrow: jest.fn(() => "https://app.example,https://admin.example") } as unknown as ConfigService);
  const response = {} as Response;

  it("allows cookie-authenticated mutations from configured origins", () => {
    const next = jest.fn() as NextFunction;

    middleware.use(request({ headers: { origin: "https://app.example" } }), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects cookie-authenticated mutations without a trusted origin", () => {
    expect(() => middleware.use(request({ headers: { origin: "https://evil.example" } }), response, jest.fn())).toThrow(BadRequestException);
  });

  it("does not require origin validation for bearer-token API clients", () => {
    const next = jest.fn() as NextFunction;

    middleware.use(request({ headers: { authorization: "Bearer api-token" } }), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
