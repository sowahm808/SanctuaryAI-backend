import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { createRedisProducerConnection } from "../../config/redis";
import { ThemesController } from "./themes.controller";
import { ThemesService } from "./themes.service";
import { ThemeGenerationService } from "./theme-generation.service";
import { THEME_GENERATION_PRODUCER, ThemeGenerationQueue } from "./theme-generation.queue";
import { ThemeGenerationProcessor } from "./theme-generation.processor";
import { THEME_GENERATION_QUEUE } from "./theme-generation.constants";
@Module({ imports: [BullModule.registerQueue({ name: THEME_GENERATION_QUEUE })], controllers: [ThemesController], providers: [ThemesService, ThemeGenerationService, ThemeGenerationProcessor, ThemeGenerationQueue, { provide: THEME_GENERATION_PRODUCER, inject: [ConfigService], useFactory: (config: ConfigService) => new Queue(THEME_GENERATION_QUEUE, { connection: createRedisProducerConnection(config.getOrThrow<string>("REDIS_URL")) }) }], exports: [ThemeGenerationQueue] })
export class ThemesModule {}
