import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ThemesController } from "./themes.controller";
import { ThemesService } from "./themes.service";
import { ThemeGenerationService } from "./theme-generation.service";
import { ThemeGenerationQueue } from "./theme-generation.queue";
import { ThemeGenerationProcessor } from "./theme-generation.processor";
import { THEME_GENERATION_QUEUE } from "./theme-generation.constants";
@Module({ imports: [BullModule.registerQueue({ name: THEME_GENERATION_QUEUE })], controllers: [ThemesController], providers: [ThemesService, ThemeGenerationService, ThemeGenerationProcessor, ThemeGenerationQueue], exports: [ThemeGenerationQueue] })
export class ThemesModule {}
