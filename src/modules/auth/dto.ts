import { IsEmail, IsString, MinLength } from "class-validator";
export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsString() @MinLength(2) displayName!: string;
}
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
export class RefreshDto {
  @IsString() refreshToken!: string;
}
export class EmailDto {
  @IsEmail() email!: string;
}
