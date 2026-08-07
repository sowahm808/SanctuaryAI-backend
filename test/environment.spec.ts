import { environmentSchema } from "../src/config/environment";

describe("environmentSchema", () => {
  const valid = {
    NODE_ENV: "production", PORT: "3000", FIREBASE_PROJECT_ID: "sanctuary-ai",
    FIREBASE_API_KEY: "firebase-api-key", FIREBASE_CLIENT_EMAIL: "firebase@example.com",
    FIREBASE_PRIVATE_KEY: "private-key", TOKEN_ENCRYPTION_KEY: "encryption-key",
    CORS_ORIGINS: "https://example.com", OPENAI_API_KEY: "openai-api-key",
  };
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

  it.each(["redis://localhost:6379", "rediss://user:pass@redis.example:6380"])("accepts %s", (REDIS_URL) => {
    expect(environmentSchema.validate({ ...valid, REDIS_URL }).error).toBeUndefined();
  });

  it.each([undefined, "", "https://redis.example", "not a url"])("rejects malformed or missing REDIS_URL %p", (REDIS_URL) => {
    expect(environmentSchema.validate({ ...valid, REDIS_URL }).error).toBeDefined();
  });

  it.each(["", "  ", "'openai-api-key'", "\"openai-api-key\""])("rejects unsafe OPENAI_API_KEY %p", (OPENAI_API_KEY) => {
    expect(environmentSchema.validate({ ...valid, REDIS_URL: "redis://localhost:6379", OPENAI_API_KEY }).error).toBeDefined();
  });

  it("validates and normalizes OpenAI model and request timeout", () => {
    const result = environmentSchema.validate({ ...valid, REDIS_URL: "redis://localhost:6379", OPENAI_MODEL: " gpt-4o-mini ", AI_REQUEST_TIMEOUT_MS: "90000" });
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(expect.objectContaining({ OPENAI_MODEL: "gpt-4o-mini", AI_REQUEST_TIMEOUT_MS: 90_000 }));
  });
});
