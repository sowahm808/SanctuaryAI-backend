import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { createHash } from "node:crypto";
import { FirebaseService } from "../src/database/firebase.service";
import { FirebaseAuthGuard } from "../src/security/firebase-auth.guard";

describe("FirebaseAuthGuard", () => {
  const context = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as ExecutionContext;

  it("authenticates the Firebase token stored in the session cookie", async () => {
    const identity = { uid: "user-1" };
    const verifyIdToken = jest.fn().mockResolvedValue(identity);
    const guard = new FirebaseAuthGuard({ verifyIdToken } as unknown as FirebaseService);
    const request = { headers: {}, cookies: { __session: "cookie-token" } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith("cookie-token");
    expect(request).toHaveProperty("user", identity);
  });

  it("authenticates the app session token stored in the session cookie", async () => {
    const verifyIdToken = jest.fn().mockRejectedValue(new UnauthorizedException());
    const getDocument = jest.fn((path: string) => {
      if (path === `sessions/${createHash("sha256").update("session-token").digest("hex")}`) {
        return {
          userId: "user-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      }
      if (path === "users/user-1") {
        return {
          email: "user@example.com",
          emailVerified: true,
          displayName: "Test User",
        };
      }
      return undefined;
    });
    const guard = new FirebaseAuthGuard({
      verifyIdToken,
      getDocument,
    } as unknown as FirebaseService);
    const request = { headers: {}, cookies: { __session: "session-token" } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty("user", {
      uid: "user-1",
      email: "user@example.com",
      emailVerified: true,
      name: "Test User",
      claims: {},
    });
  });

  it("prefers an explicit bearer token over the session cookie", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: "user-1" });
    const guard = new FirebaseAuthGuard({ verifyIdToken } as unknown as FirebaseService);
    const request = {
      headers: { authorization: "Bearer bearer-token" },
      cookies: { __session: "cookie-token" },
    };

    await guard.canActivate(context(request));
    expect(verifyIdToken).toHaveBeenCalledWith("bearer-token");
  });

  it("rejects a request with neither authentication mechanism", async () => {
    const guard = new FirebaseAuthGuard({} as FirebaseService);

    await expect(guard.canActivate(context({ headers: {}, cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
