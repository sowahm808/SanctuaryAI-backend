import { Module } from "@nestjs/common";
import { ThemesController } from "./themes.controller";
import { ThemesService } from "./themes.service";
import { ThemeGenerationService } from "./theme-generation.service";
@Module({ controllers: [ThemesController], providers: [ThemesService, ThemeGenerationService] })
export class ThemesModule {}
