import { AuthService } from "../src/modules/auth/auth.service";
import { FirebaseService } from "../src/database/firebase.service";

describe("AuthService Firebase login", () => {
  afterEach(() => jest.restoreAllMocks());

  it("verifies a client Firebase token and returns the authenticated user", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const identity = {
      uid: "firebase-user",
      email: "user@example.com",
      emailVerified: true,
      claims: { exp: expiresAt },
    };
    const verifyIdToken = jest.fn().mockResolvedValue(identity);
    const ensureUserProfile = jest.fn().mockResolvedValue(undefined);
    const firebase = {
      verifyIdToken,
      ensureUserProfile,
    } as unknown as FirebaseService;
    const service = new AuthService(firebase);

    const result = await service.loginWithFirebase("firebase-id-token");

    expect(result.user).toBe(identity);
    expect(result.tokens.accessToken).toBe("firebase-id-token");
    expect(result.tokens.expiresIn).toBeGreaterThan(0);
    expect(verifyIdToken).toHaveBeenCalledWith("firebase-id-token");
    expect(ensureUserProfile).toHaveBeenCalledWith(identity);
  });

  it("exchanges a client Firebase token and ensures its user profile", async () => {
    const identity = {
      uid: "new-firebase-user",
      emailVerified: false,
      name: "New User",
      claims: { exp: Math.floor(Date.now() / 1000) + 3600 },
    };
    const ensureUserProfile = jest.fn().mockResolvedValue(undefined);
    const firebase = {
      verifyIdToken: jest.fn().mockResolvedValue(identity),
      ensureUserProfile,
    } as unknown as FirebaseService;
    const service = new AuthService(firebase);

    const result = await service.exchangeFirebaseToken("firebase-id-token");

    expect(result.user).toBe(identity);
    expect(result.tokens.accessToken).toBe("firebase-id-token");
    expect(ensureUserProfile).toHaveBeenCalledWith(identity);
  });
});
