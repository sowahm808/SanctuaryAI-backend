import { Module } from "@nestjs/common";
import { ThemesController } from "./themes.controller";
import { ThemesService } from "./themes.service";
import { ThemeGenerationService } from "./theme-generation.service";
import { ThemeGenerationQueue } from "./theme-generation.queue";
import { ThemeGenerationProcessor } from "./theme-generation.processor";
@Module({ controllers: [ThemesController], providers: [ThemesService, ThemeGenerationService, ThemeGenerationProcessor, ThemeGenerationQueue], exports: [ThemeGenerationQueue] })
export class ThemesModule {}
