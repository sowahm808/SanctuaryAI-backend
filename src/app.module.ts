import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { environmentSchema } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { CorrelationMiddleware } from "./common/correlation.middleware";
import { CsrfOriginMiddleware } from "./common/csrf-origin.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { HealthController } from "./modules/health/health.controller";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { ThemesModule } from "./modules/themes/themes.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";
import { PublicConfigModule } from "./modules/public-config/public-config.module";
import { SecurityModule } from "./security/security.module";
import { createRedisConnection } from "./config/redis";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentSchema,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: createRedisConnection(config.getOrThrow<string>("REDIS_URL")),
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "password",
          "idToken",
          "accessToken",
          "refreshToken",
          "privateKey",
        ],
      },
    }),
    DatabaseModule,
    SecurityModule,
    AuthModule,
    DashboardModule,
    OrganizationsModule,
    JobsModule,
    CampaignsModule,
    ThemesModule,
    // Register static public routes before WorkflowsModule's top-level
    // `:area` routes so `/config/public` cannot be parsed as a workflow area.
    PublicConfigModule,
    WorkflowsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware, CsrfOriginMiddleware).forRoutes("*");
  }
}
