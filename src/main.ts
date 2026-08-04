import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { EnvelopeInterceptor } from "./common/envelope.interceptor";
import { legacyApiPathMiddleware } from "./common/legacy-api-path.middleware";
import { ProblemFilter } from "./common/problem.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  // Keep existing clients functional while they migrate to versioned URLs.
  app.use(legacyApiPathMiddleware);
  app.setGlobalPrefix("api/v1");

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  const corsOrigins = config
    .getOrThrow<string>("CORS_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );

  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new ProblemFilter());

  if (config.get<boolean>("SWAGGER_ENABLED")) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("SanctuaryAI API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    const swaggerDocument = SwaggerModule.createDocument(
      app,
      swaggerConfig,
    );

    SwaggerModule.setup("docs", app, swaggerDocument);
  }

  app.enableShutdownHooks();

  const port = config.get<number>("PORT") ?? 3000;

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
