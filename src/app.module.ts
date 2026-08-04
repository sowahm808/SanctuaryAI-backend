import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { environmentSchema } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { CorrelationMiddleware } from "./common/correlation.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { HealthController } from "./modules/health/health.controller";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { ThemesModule } from "./modules/themes/themes.module";
import { SecurityModule } from "./security/security.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentSchema,
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
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
