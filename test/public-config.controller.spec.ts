import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PublicConfigController } from "../src/modules/public-config/public-config.controller";

describe("PublicConfigController", () => {
  it("returns the Firebase web configuration without server secrets", async () => {
    const values: Record<string, string> = {
      FIREBASE_API_KEY: "public-firebase-api-key",
      FIREBASE_PROJECT_ID: "sanctuary-ai",
      FIREBASE_PRIVATE_KEY: "server-private-key",
      TOKEN_ENCRYPTION_KEY: "server-encryption-key",
    };
    const module = await Test.createTestingModule({
      controllers: [PublicConfigController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const value = values[key];
              if (value === undefined) throw new Error(`Missing ${key}`);
              return value;
            },
          },
        },
      ],
    }).compile();

    const result = module.get(PublicConfigController).getPublicConfig();

    expect(result).toEqual({
      firebase: {
        apiKey: "public-firebase-api-key",
        authDomain: "sanctuary-ai.firebaseapp.com",
        projectId: "sanctuary-ai",
      },
    });
    expect(JSON.stringify(result)).not.toContain("server-private-key");
    expect(JSON.stringify(result)).not.toContain("server-encryption-key");
  });
});
