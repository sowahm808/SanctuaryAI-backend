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
export class FirebaseLoginDto {
  @IsString() @MinLength(1) idToken!: string;
}
export class RefreshDto {
  @IsString() refreshToken!: string;
}
export class EmailDto {
  @IsEmail() email!: string;
}

export class MfaVerifyDto {
  @IsString() @MinLength(1) challengeId!: string;
  @IsString() @MinLength(1) code!: string;
}
export class InvitationAcceptDto {
  @IsString() @MinLength(1) token!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(12) password!: string;
}
export class PasswordResetDto {
  @IsString() @MinLength(1) token!: string;
  @IsString() @MinLength(12) password!: string;
}
export class EmailVerifyDto {
  @IsString() @MinLength(1) token!: string;
}
