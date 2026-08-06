import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
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

@Injectable()
export class ThemeGenerationService {
  private readonly logger = new Logger(ThemeGenerationService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(input: RecordValue, currentOutput: RecordValue, scope?: string): Promise<RecordValue> {
    const apiKey = this.config.getOrThrow<string>("OPENAI_API_KEY");
    const model = this.config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
    let response: Response | undefined;
    let lastAttempt = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      lastAttempt = attempt;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(90_000),
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
        this.logFailure("request_error", model, attempt, undefined, error);
        if (attempt === MAX_ATTEMPTS) throw this.unavailable();
        continue;
      }
      if (response.ok || !this.retryable(response.status) || attempt === MAX_ATTEMPTS) break;
      this.logFailure("retryable_response", model, attempt, response.status);
    }

    if (!response) throw this.unavailable();

    const body = await response.json().catch(() => ({})) as ChatCompletion;
    if (!response.ok) {
      this.logFailure("provider_response", model, lastAttempt, response.status, body.error, response.headers.get("x-request-id") ?? undefined);
      throw this.unavailable();
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      this.logFailure("empty_response", model, lastAttempt, response.status, body.error, response.headers.get("x-request-id") ?? undefined);
      throw this.unavailable();
    }
    try {
      const result = JSON.parse(content) as unknown;
      if (!this.valid(result)) throw new Error("invalid output");
      return result;
    } catch (error) {
      this.logFailure("invalid_response", model, lastAttempt, response.status, error, response.headers.get("x-request-id") ?? undefined);
      throw this.unavailable();
    }
  }

  private retryable(status: number): boolean {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  private logFailure(reason: string, model: string, attempt: number, status?: number, error?: unknown, providerRequestId?: string): void {
    const providerError = error && typeof error === "object" ? error as RecordValue : undefined;
    this.logger.error({
      reason,
      model,
      attempt,
      ...(status === undefined ? {} : { status }),
      ...(providerRequestId ? { providerRequestId } : {}),
      ...(providerError ? { providerError: { code: providerError.code, type: providerError.type, message: providerError.message } } : {}),
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

  private unavailable() {
    return new ServiceUnavailableException({ code: "theme_generation_failed", message: "The AI provider could not generate this theme. Please try again." });
  }
}
