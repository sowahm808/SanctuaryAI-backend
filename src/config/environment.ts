import * as Joi from "joi";

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),

  PORT: Joi.number().port().default(3000),

  FIREBASE_PROJECT_ID: Joi.string().min(2).default("sanctuaryai-b1012"),
  FIREBASE_API_KEY: Joi.string().min(10).required(),

  FIREBASE_CLIENT_EMAIL: Joi.string()
    .email()
    .when("FIRESTORE_EMULATOR_HOST", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),

  FIREBASE_PRIVATE_KEY: Joi.string().when("FIRESTORE_EMULATOR_HOST", {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),

  FIRESTORE_EMULATOR_HOST: Joi.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: Joi.string().optional(),

  REDIS_URL: Joi.string().uri().required(),
  TOKEN_ENCRYPTION_KEY: Joi.string().required(),
  CORS_ORIGINS: Joi.string().required(),

  // OPENAI_API_KEY: Joi.string().allow("").optional(),
  OPENAI_API_KEY: Joi.string().trim().min(1).custom((value: string, helpers) => (/^['"]|['"]$/.test(value) || /[\r\n]/.test(value) ? helpers.error("string.invalid") : value)).required(),
  OPENAI_MODEL: Joi.string().trim().min(1).default("gpt-4o-mini"),
  AI_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(90000),
  THEME_GENERATION_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  THEME_GENERATION_STUCK_JOB_MINUTES: Joi.number().integer().min(1).default(15),
  THEME_GENERATION_CONCURRENCY: Joi.number().integer().min(1).max(20).default(1),
  SWAGGER_ENABLED: Joi.boolean().default(true),
});
