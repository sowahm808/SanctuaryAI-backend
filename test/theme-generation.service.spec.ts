import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThemeGenerationService } from "../src/modules/themes/theme-generation.service";

const generatedTheme = {
  title: "Living Hope", subtitle: "", scriptures: ["1 Peter 1:3"], explanation: "Hope in Christ",
  pastoralIntroduction: "Welcome", objectives: ["Grow in hope"], weeklyDirection: ["Week 1: Hope"],
  confession: "I have hope", declaration: "We live in hope", hashtags: ["#LivingHope"],
  flyerHeadline: "Living Hope", designConcept: "Sunrise",
};

const success = () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(generatedTheme) } }],
}), { status: 200 });

const providerError = (status: number, code?: string, type?: string, headers?: Record<string, string>) => new Response(JSON.stringify({
  error: { code, type, message: "secret provider detail", param: null },
}), { status, headers });

describe("ThemeGenerationService", () => {
  const getOrThrow = jest.fn().mockReturnValue("test-api-key");
  const get = jest.fn((key: string) => key === "OPENAI_MODEL" ? "gpt-4o-mini" : 90_000);
  const config = { getOrThrow, get } as unknown as ConfigService;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    getOrThrow.mockReturnValue("test-api-key");
  });

  it("returns a validated structured theme from a 200 response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(success());
    await expect(new ThemeGenerationService(config).generate({ topic: "Hope" }, {})).resolves.toEqual(generatedTheme);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies insufficient quota and does not retry it", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(providerError(429, "insufficient_quota", "insufficient_quota"));
    await expect(new ThemeGenerationService(config).generate({}, {})).rejects.toMatchObject({
      safeCode: "ai_provider_quota_exhausted",
      safeDetail: "The AI provider account has no available API quota. An administrator must review billing and project usage limits.",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries true rate limits with exponential backoff and jitter in bounds", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(providerError(429, "rate_limit_exceeded"))
      .mockResolvedValueOnce(providerError(429, undefined, "rate_limit_exceeded"))
      .mockResolvedValueOnce(success());
    const result = new ThemeGenerationService(config).generate({}, {});
    await jest.advanceTimersByTimeAsync(1_249);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2_250);
    await expect(result).resolves.toEqual(generatedTheme);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns the rate-limit classification after the final attempt", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(global, "fetch").mockResolvedValue(providerError(429));
    const result = new ThemeGenerationService(config).generate({}, {});
    const assertion = expect(result).rejects.toMatchObject({ safeCode: "ai_provider_rate_limited", retryable: true });
    await jest.advanceTimersByTimeAsync(3_000);
    await assertion;
  });

  it("honors Retry-After seconds", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(providerError(429, "rate_limit_exceeded", undefined, { "retry-after": "5" })).mockResolvedValueOnce(success());
    const result = new ThemeGenerationService(config).generate({}, {});
    await jest.advanceTimersByTimeAsync(4_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual(generatedTheme);
  });

  it("honors Retry-After HTTP dates", async () => {
    jest.useFakeTimers({ now: new Date("2026-08-06T00:00:00.000Z") });
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(providerError(429, "rate_limit_exceeded", undefined, { "retry-after": "Thu, 06 Aug 2026 00:00:07 GMT" })).mockResolvedValueOnce(success());
    const result = new ThemeGenerationService(config).generate({}, {});
    await jest.advanceTimersByTimeAsync(6_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual(generatedTheme);
  });

  it.each([
    [401, "ai_provider_misconfigured", false], [403, "ai_provider_misconfigured", false],
    [404, "ai_provider_misconfigured", false], [400, "provider_invalid_request", false],
  ])("classifies HTTP %i safely", async (status, safeCode, retryable) => {
    jest.spyOn(global, "fetch").mockResolvedValue(providerError(status));
    await expect(new ThemeGenerationService(config).generate({}, {})).rejects.toMatchObject({ safeCode, retryable });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([[408, "ai_provider_timeout"], [500, "ai_provider_unavailable"]])("classifies retryable HTTP %i", async (status, safeCode) => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(global, "fetch").mockResolvedValue(providerError(status));
    const result = new ThemeGenerationService(config).generate({}, {});
    const assertion = expect(result).rejects.toMatchObject({ safeCode, retryable: true });
    await jest.advanceTimersByTimeAsync(3_000);
    await assertion;
  });

  it("classifies request timeouts separately from network failures", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const timeout = new Error("request timed out"); timeout.name = "TimeoutError";
    jest.spyOn(global, "fetch").mockRejectedValue(timeout);
    const result = new ThemeGenerationService(config).generate({}, {});
    const assertion = expect(result).rejects.toMatchObject({ safeCode: "ai_provider_timeout", retryable: true });
    await jest.advanceTimersByTimeAsync(3_000);
    await assertion;
  });

  it.each([
    ["malformed success JSON", () => new Response("not json", { status: 200 })],
    ["missing choices", () => new Response("{}", { status: 200 })],
    ["schema-invalid output", () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 })],
  ])("rejects %s", async (_name, response) => {
    jest.spyOn(global, "fetch").mockResolvedValue(response());
    await expect(new ThemeGenerationService(config).generate({}, {})).rejects.toMatchObject({ safeCode: "ai_response_invalid", retryable: false });
  });

  it("logs only allow-listed provider metadata", async () => {
    const log = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(global, "fetch").mockResolvedValue(providerError(401, "invalid_api_key", "authentication_error", { "x-request-id": "request-1" }));
    await expect(new ThemeGenerationService(config).generate({}, {}, undefined, { correlationId: "correlation-1", jobId: "job-1", organizationId: "org-1", themeId: "theme-1" })).rejects.toBeDefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: 401, providerCode: "invalid_api_key", providerType: "authentication_error", providerRequestId: "request-1" }), "OpenAI theme generation failed");
    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).not.toContain("secret provider detail");
    expect(serialized).not.toContain("test-api-key");
  });
});
