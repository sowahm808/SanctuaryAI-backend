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
    const firebase = {
      verifyIdToken,
    } as unknown as FirebaseService;
    const service = new AuthService(firebase);

    const result = await service.loginWithFirebase("firebase-id-token");

    expect(result.user).toBe(identity);
    expect(result.tokens.accessToken).toBe("firebase-id-token");
    expect(result.tokens.expiresIn).toBeGreaterThan(0);
    expect(verifyIdToken).toHaveBeenCalledWith("firebase-id-token");
  });
});
