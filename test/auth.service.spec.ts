import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../src/modules/auth/auth.service";
import { FirebaseService } from "../src/database/firebase.service";

/* Jest's asymmetric matchers and method mocks intentionally use dynamic types. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

const identity = {
  uid: "firebase-user",
  email: "user@example.com",
  emailVerified: true,
  name: "Ada",
  claims: { exp: Math.floor(Date.now() / 1000) + 3600 },
};

const records: Record<string, Record<string, unknown>> = {
  "users/firebase-user": {
    activeOrganizationId: "org-1",
    displayName: "Pastor Ada",
    email: "user@example.com",
  },
  "memberships/org-1_firebase-user": {
    status: "ACTIVE",
    role: "SeniorPastor",
    permissions: ["themes.read", "themes.read", "not.allowed"],
  },
  "organizations/org-1": {
    name: "Grace Church",
    setupComplete: true,
    subscriptionStatus: "TRIAL",
  },
};

function firebaseMock(overrides: Partial<FirebaseService> = {}): FirebaseService {
  return {
    verifyIdToken: jest.fn().mockResolvedValue(identity),
    ensureUserProfile: jest.fn().mockResolvedValue(undefined),
    getDocument: jest.fn((path: string) => Promise.resolve(records[path])),
    putDocument: jest.fn().mockResolvedValue(undefined),
    deleteDocument: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FirebaseService;
}

describe("AuthService application sessions", () => {
  it("exchanges a verified Firebase token for an opaque application session", async () => {
    const firebase = firebaseMock();
    const result = await new AuthService(firebase).exchangeFirebaseToken("id-token");

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.result).toEqual({
      status: "authenticated",
      session: expect.objectContaining({
        role: "SeniorPastor",
        organizationId: "org-1",
        organizationSetupComplete: true,
        subscriptionActive: true,
        user: expect.objectContaining({ permissions: ["themes.read"] }),
      }),
    });
    expect(firebase.putDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^sessions\/[a-f0-9]{64}$/),
      expect.objectContaining({ userId: "firebase-user" }),
    );
  });

  it("does not create a session for an unverified email", async () => {
    const firebase = firebaseMock({
      verifyIdToken: jest.fn().mockResolvedValue({ ...identity, emailVerified: false }),
    });
    const result = await new AuthService(firebase).exchangeFirebaseToken("id-token");
    expect(result).toEqual({ result: { status: "verification_required" } });
    expect(firebase.putDocument).not.toHaveBeenCalled();
  });

  it("creates an onboarding session when the user has no organization yet", async () => {
    const firebase = firebaseMock({
      getDocument: jest.fn((path: string) =>
        Promise.resolve(
          path === "users/firebase-user"
            ? { displayName: "Pastor Ada", email: "user@example.com" }
            : undefined,
        ),
      ),
    });

    const result = await new AuthService(firebase).exchangeFirebaseToken("id-token");

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.result).toEqual({
      status: "authenticated",
      session: {
        user: {
          id: "firebase-user",
          name: "Pastor Ada",
          email: "user@example.com",
          permissions: [],
        },
        role: null,
        organizationId: null,
        organizationName: null,
        organizationSetupComplete: false,
        subscriptionActive: false,
      },
    });
  });

  it("re-reads current authorization while restoring a valid session", async () => {
    const firebase = firebaseMock({
      getDocument: jest.fn((path: string) =>
        Promise.resolve(
          path.startsWith("sessions/")
            ? {
                userId: "firebase-user",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              }
            : records[path],
        ),
      ),
    });
    const session = await new AuthService(firebase).restoreSession("opaque-token");
    expect(session.organizationName).toBe("Grace Church");
    expect(firebase.getDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^sessions\/[a-f0-9]{64}$/),
    );
  });

  it("rejects an expired session", async () => {
    const firebase = firebaseMock({
      getDocument: jest.fn().mockResolvedValue({
        userId: "firebase-user",
        expiresAt: new Date(Date.now() - 1).toISOString(),
      }),
    });
    await expect(new AuthService(firebase).restoreSession("expired")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(firebase.deleteDocument).toHaveBeenCalled();
  });

  it("rejects a suspended membership", async () => {
    const firebase = firebaseMock({
      getDocument: jest.fn((path: string) =>
        Promise.resolve(
          path === "memberships/org-1_firebase-user"
            ? { ...records[path], status: "SUSPENDED" }
            : records[path],
        ),
      ),
    });
    await expect(
      new AuthService(firebase).exchangeFirebaseToken("id-token"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("makes logout idempotent when no cookie is present", async () => {
    const firebase = firebaseMock();
    await new AuthService(firebase).logout("");
    expect(firebase.deleteDocument).not.toHaveBeenCalled();
  });
});
