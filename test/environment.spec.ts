import { environmentSchema } from "../src/config/environment";

describe("environmentSchema", () => {
  it("loads Joi and validates a production environment", () => {
    const result = environmentSchema.validate({
      NODE_ENV: "production",
      PORT: "3000",
      FIREBASE_PROJECT_ID: "sanctuary-ai",
      FIREBASE_API_KEY: "firebase-api-key",
      FIREBASE_CLIENT_EMAIL: "firebase@example.com",
      FIREBASE_PRIVATE_KEY: "private-key",
      REDIS_URL: "redis://localhost:6379",
      TOKEN_ENCRYPTION_KEY: "encryption-key",
      CORS_ORIGINS: "https://example.com",
      OPENAI_API_KEY: "openai-api-key",
    });

    expect(result.error).toBeUndefined();
  });
});
