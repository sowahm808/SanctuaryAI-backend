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

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { code?: string; message?: string; type?: string };
}

const MAX_ATTEMPTS = 3;

export class ThemeGenerationError extends Error {
  constructor(public readonly safeCode: string, public readonly safeDetail: string, public readonly retryable: boolean) { super(safeDetail); }
}

@Injectable()
export class ThemeGenerationService {
  private readonly logger = new Logger(ThemeGenerationService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(input: RecordValue, currentOutput: RecordValue, scope?: string, context: RecordValue = {}): Promise<RecordValue> {
    const apiKey = this.config.getOrThrow<string>("OPENAI_API_KEY")?.trim();
    const model = this.config.get<string>("OPENAI_MODEL")?.trim();
    if (!apiKey || !model) throw new ThemeGenerationError("ai_provider_misconfigured", "The AI provider is not configured.", false);
    let response: Response | undefined;
    let lastAttempt = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      lastAttempt = attempt;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(typeof this.config.get<number>("AI_REQUEST_TIMEOUT_MS") === "number" ? this.config.get<number>("AI_REQUEST_TIMEOUT_MS")! : 90_000),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You create biblically responsible, practical monthly church themes. Return only content grounded in the supplied brief. Scripture references must include the requested translation when one is provided. Never invent quotations." },
              { role: "user", content: JSON.stringify({ task: scope ? `Refine the theme using the '${scope}' instruction.` : "Generate a complete monthly church theme.", brief: input, currentTheme: currentOutput }) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "church_theme", strict: true, schema: THEME_SCHEMA } },
          }),
        });
      } catch {
        this.logFailure("request_error", model, attempt, context);
        if (attempt === MAX_ATTEMPTS) throw new ThemeGenerationError("ai_provider_timeout", "The AI provider timed out.", true);
        continue;
      }
      if (response.ok || !this.retryable(response.status) || attempt === MAX_ATTEMPTS) break;
      this.logFailure("retryable_response", model, attempt, context, response.status);
    }

    if (!response) throw new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", true);

    const body = await response.json().catch(() => ({})) as ChatCompletion;
    if (!response.ok) {
      this.logFailure("provider_response", model, lastAttempt, context, response.status, response.headers.get("x-request-id") ?? undefined);
      throw this.classify(response.status);
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      this.logFailure("empty_response", model, lastAttempt, context, response.status, response.headers.get("x-request-id") ?? undefined);
      throw new ThemeGenerationError("ai_response_invalid", "The AI provider returned an invalid response.", false);
    }
    try {
      const result = JSON.parse(content) as unknown;
      if (!this.valid(result)) throw new Error("invalid output");
      return result;
    } catch {
      this.logFailure("invalid_response", model, lastAttempt, context, response.status, response.headers.get("x-request-id") ?? undefined);
      throw new ThemeGenerationError("ai_response_invalid", "The AI provider returned an invalid response.", false);
    }
  }

  private retryable(status: number): boolean {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  private logFailure(reason: string, model: string, attempt: number, context: RecordValue, status?: number, providerRequestId?: string): void {
    this.logger.error({
      reason,
      model,
      attempt,
      correlationId: context.correlationId, jobId: context.jobId, organizationId: context.organizationId, themeId: context.themeId,
      ...(status === undefined ? {} : { status }),
      ...(providerRequestId ? { providerRequestId } : {}),
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

  private classify(status: number) { if ([401,403,404].includes(status)) return new ThemeGenerationError("ai_provider_misconfigured", "The AI provider is not configured correctly.", false); if (status === 408) return new ThemeGenerationError("ai_provider_timeout", "The AI provider timed out.", true); if (status === 400) return new ThemeGenerationError("provider_invalid_request", "The AI provider rejected the generation request.", false); return new ThemeGenerationError("ai_provider_unavailable", "The AI provider is temporarily unavailable.", this.retryable(status)); }
}
