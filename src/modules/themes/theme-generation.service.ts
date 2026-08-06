import { Injectable, ServiceUnavailableException } from "@nestjs/common";
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
  error?: { message?: string };
}

@Injectable()
export class ThemeGenerationService {
  constructor(private readonly config: ConfigService) {}

  async generate(input: RecordValue, currentOutput: RecordValue, scope?: string): Promise<RecordValue> {
    const apiKey = this.config.getOrThrow<string>("OPENAI_API_KEY");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: this.config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: "You create biblically responsible, practical monthly church themes. Return only content grounded in the supplied brief. Scripture references must include the requested translation when one is provided. Never invent quotations." },
          { role: "user", content: JSON.stringify({ task: scope ? `Refine the theme using the '${scope}' instruction.` : "Generate a complete monthly church theme.", brief: input, currentTheme: currentOutput }) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "church_theme", strict: true, schema: THEME_SCHEMA } },
      }),
    }).catch(() => { throw this.unavailable(); });

    const body = await response.json().catch(() => ({})) as ChatCompletion;
    if (!response.ok) throw this.unavailable();
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw this.unavailable();
    try {
      const result = JSON.parse(content) as unknown;
      if (!this.valid(result)) throw new Error("invalid output");
      return result;
    } catch {
      throw this.unavailable();
    }
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
