import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type RecordValue = Record<string, unknown>;

const THEME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "scriptures", "explanation", "pastoralIntroduction", "objectives", "weeklyDirection", "confession", "declaration", "hashtags", "flyerHeadline", "designConcept"],
  properties: {
    title: { type: "string" }, subtitle: { type: "string" },
    scriptures: { type: "array", items: { type: "string" } },
    explanation: { type: "string" }, pastoralIntroduction: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    weeklyDirection: { type: "array", items: { type: "string" } },
    confession: { type: "string" }, declaration: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    flyerHeadline: { type: "string" }, designConcept: { type: "string" },
  },
} as const;

interface OpenAIErrorBody {
  error?: {
    code?: string | null;
    type?: string;
    message?: string;
    param?: string | null;
  };
}

interface ChatCompletion extends OpenAIErrorBody {
  choices?: Array<{ message?: { content?: string } }>;
}

interface ProviderMetadata {
  status?: number;
  providerRequestId?: string;
  providerCode?: string;
  providerType?: string;
}

const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 15_000;
const MAX_JITTER_MS = 500;

export class ThemeGenerationError extends Error {
  constructor(public readonly safeCode: string, public readonly safeDetail: string, public readonly retryable: boolean) {
    super(safeDetail);
  }
}

@Injectable()
export class ThemeGenerationService {
  private readonly logger = new Logger(ThemeGenerationService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(input: RecordValue, currentOutput: RecordValue, scope?: string, context: RecordValue = {}): Promise<RecordValue> {
    const apiKey = this.config.getOrThrow<string>("OPENAI_API_KEY")?.trim();
    const model = this.config.get<string>("OPENAI_MODEL")?.trim();
    const configuredTimeout = this.config.get<number>("AI_REQUEST_TIMEOUT_MS");
    const timeoutMs = typeof configuredTimeout === "number" ? configuredTimeout : 90_000;
    if (!apiKey || !model) {
      throw new ThemeGenerationError("ai_provider_misconfigured", "The AI provider is not configured correctly.", false);
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You create biblically responsible, practical monthly church themes. Return only content grounded in the supplied brief. Scripture references must include the requested translation when one is provided. Never invent quotations." },
              { role: "user", content: JSON.stringify({ task: scope ? `Refine the theme using the '${scope}' instruction.` : "Generate a complete monthly church theme.", brief: input, currentTheme: currentOutput }) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "church_theme", strict: true, schema: THEME_SCHEMA } },
          }),
        });
      } catch (error) {
        const classified = this.classifyRequestError(error);
        this.logFailure("request_error", model, attempt, context);
        if (!classified.retryable || attempt === MAX_ATTEMPTS) throw classified;
        await this.delayWithJitter(attempt);
        continue;
      }

      const providerRequestId = response.headers.get("x-request-id") ?? undefined;
      if (!response.ok) {
        const errorBody = await this.readErrorBody(response);
        const providerCode = this.safeString(errorBody.error?.code);
        const providerType = this.safeString(errorBody.error?.type);
        const metadata = { status: response.status, providerRequestId, providerCode, providerType };
        const classified = this.classify(response.status, providerCode, providerType);
        this.logFailure("provider_response", model, attempt, context, metadata);
        if (!classified.retryable || attempt === MAX_ATTEMPTS) throw classified;
        await this.delayWithJitter(attempt, this.parseRetryAfter(response.headers.get("retry-after")));
        continue;
      }

      const body = await this.readSuccessBody(response);
      const content = body?.choices?.[0]?.message?.content;
      if (!content) {
        this.logFailure("empty_response", model, attempt, context, { status: response.status, providerRequestId });
        throw this.invalidResponse();
      }
      try {
        const result = JSON.parse(content) as unknown;
        if (!this.valid(result)) throw new Error("invalid output");
        return result;
      } catch {
        this.logFailure("invalid_response", model, attempt, context, { status: response.status, providerRequestId });
        throw this.invalidResponse();
      }
    }

    throw new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
  }

  private async readErrorBody(response: Response): Promise<OpenAIErrorBody> {
    try {
      const value = await response.json() as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const error = (value as RecordValue).error;
      if (!error || typeof error !== "object" || Array.isArray(error)) return {};
      const record = error as RecordValue;
      return { error: { code: this.safeString(record.code) ?? null, type: this.safeString(record.type) } };
    } catch {
      return {};
    }
  }

  private async readSuccessBody(response: Response): Promise<ChatCompletion | undefined> {
    try {
      const value = await response.json() as unknown;
      return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return undefined;
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
  }

  private async delayWithJitter(attempt: number, retryAfterMs?: number): Promise<void> {
    const backoffMs = 1_000 * 2 ** (attempt - 1);
    const jitterMs = Math.floor(Math.random() * (MAX_JITTER_MS + 1));
    const delayMs = Math.min((retryAfterMs ?? backoffMs) + jitterMs, MAX_RETRY_DELAY_MS);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  private logFailure(reason: string, model: string, attempt: number, context: RecordValue, metadata: ProviderMetadata = {}): void {
    this.logger.error({
      reason,
      model,
      attempt,
      correlationId: context.correlationId,
      jobId: context.jobId,
      organizationId: context.organizationId,
      themeId: context.themeId,
      ...(metadata.status === undefined ? {} : { status: metadata.status }),
      ...(metadata.providerRequestId ? { providerRequestId: metadata.providerRequestId } : {}),
      ...(metadata.providerCode ? { providerCode: metadata.providerCode } : {}),
      ...(metadata.providerType ? { providerType: metadata.providerType } : {}),
    }, "OpenAI theme generation failed");
  }

  private valid(value: unknown): value is RecordValue {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as RecordValue;
    for (const [name, definition] of Object.entries(THEME_SCHEMA.properties)) {
      const field = record[name];
      if (definition.type === "array") {
        if (!Array.isArray(field) || !field.every((item) => typeof item === "string")) return false;
      } else if (typeof field !== "string") return false;
    }
    return true;
  }

  private classify(status: number, providerCode?: string, providerType?: string): ThemeGenerationError {
    if (providerCode === "insufficient_quota" || providerType === "insufficient_quota") {
      return new ThemeGenerationError("ai_provider_quota_exhausted", "The AI provider account has no available API quota. An administrator must review billing and project usage limits.", false);
    }
    if (providerCode === "rate_limit_exceeded" || providerType === "rate_limit_exceeded" || status === 429) {
      return new ThemeGenerationError("ai_provider_rate_limited", "The AI provider rate limit was reached. Please retry later.", true);
    }
    if ([401, 403, 404].includes(status)) return new ThemeGenerationError("ai_provider_misconfigured", "The AI provider is not configured correctly.", false);
    if (status === 408) return new ThemeGenerationError("ai_provider_timeout", "The AI provider timed out.", true);
    if (status === 400) return new ThemeGenerationError("provider_invalid_request", "The AI provider rejected the generation request.", false);
    if ([500, 502, 503, 504].includes(status)) return new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
    return new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", false);
  }

  private classifyRequestError(error: unknown): ThemeGenerationError {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") return new ThemeGenerationError("ai_provider_timeout", "The AI provider timed out.", true);
    return new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);
  }

  private invalidResponse(): ThemeGenerationError {
    return new ThemeGenerationError("ai_response_invalid", "The AI provider returned an invalid response.", false);
  }

  private safeString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
}
