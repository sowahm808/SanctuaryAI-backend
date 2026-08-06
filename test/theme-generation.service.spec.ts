import { ConfigService } from "@nestjs/config";
import { ThemeGenerationService } from "../src/modules/themes/theme-generation.service";

const generatedTheme = {
  title: "Living Hope",
  subtitle: "",
  scriptures: ["1 Peter 1:3"],
  explanation: "Hope in Christ",
  pastoralIntroduction: "Welcome",
  objectives: ["Grow in hope"],
  weeklyDirection: ["Week 1: Hope"],
  confession: "I have hope",
  declaration: "We live in hope",
  hashtags: ["#LivingHope"],
  flyerHeadline: "Living Hope",
  designConcept: "Sunrise",
};

describe("ThemeGenerationService", () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue("test-api-key"),
    get: jest.fn().mockReturnValue("gpt-4o-mini"),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a structured theme from the provider", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(generatedTheme) } }],
    }), { status: 200 }));

    await expect(new ThemeGenerationService(config).generate({ topic: "Hope" }, {})).resolves.toEqual(generatedTheme);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries transient provider failures", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(generatedTheme) } }],
      }), { status: 200 }));

    await expect(new ThemeGenerationService(config).generate({ topic: "Hope" }, {})).resolves.toEqual(generatedTheme);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps provider errors out of the client response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "invalid_api_key", message: "secret provider detail", type: "authentication_error" },
    }), { status: 401, headers: { "x-request-id": "provider-request-id" } }));

    await expect(new ThemeGenerationService(config).generate({ topic: "Hope" }, {})).rejects.toMatchObject({
      safeCode: "ai_provider_misconfigured", retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
