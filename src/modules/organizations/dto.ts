import { IsHexColor, IsOptional, IsString, MinLength } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  seniorPastor?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  slogan?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  bibleTranslation?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  doctrinalGuidelines?: string;
}
