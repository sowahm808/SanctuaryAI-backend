import * as Joi from "joi";

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),

  PORT: Joi.number().port().default(3000),

  FIREBASE_PROJECT_ID: Joi.string().min(2).required(),
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

  OPENAI_API_KEY: Joi.string().allow("").optional(),
  SWAGGER_ENABLED: Joi.boolean().default(true),
});