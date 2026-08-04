import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  CurrentUser,
  FIREBASE_SESSION_COOKIE,
  FirebaseAuthGuard,
} from "../../security/firebase-auth.guard";
import { FirebaseIdentity } from "../../database/firebase.service";
import { AuthService } from "./auth.service";
import {
  EmailDto,
  FirebaseLoginDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
} from "./dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  @Post("register")
  @ApiOperation({ summary: "Create a Firebase email/password account" })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto);
    this.setSessionCookie(
      response,
      result.tokens.accessToken,
      result.tokens.expiresIn,
    );
    return result;
  }
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in through Firebase Authentication" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto);
    this.setSessionCookie(
      response,
      result.tokens.accessToken,
      result.tokens.expiresIn,
    );
    return result;
  }
  @Post("firebase")
  @HttpCode(200)
  @ApiOperation({ summary: "Authenticate with a Firebase ID token" })
  async firebase(
    @Body() dto: FirebaseLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.loginWithFirebase(dto.idToken);
    this.setSessionCookie(
      response,
      result.tokens.accessToken,
      result.tokens.expiresIn,
    );
    return result;
  }
  @Post("firebase/exchange")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a Firebase ID token for an app session" })
  async exchangeFirebaseToken(
    @Body() dto: FirebaseLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.exchangeFirebaseToken(dto.idToken);
    this.setSessionCookie(
      response,
      result.tokens.accessToken,
      result.tokens.expiresIn,
    );
    return result;
  }
  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a Firebase refresh token" })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(dto.refreshToken);
    this.setSessionCookie(
      response,
      result.tokens.accessToken,
      result.tokens.expiresIn,
    );
    return result;
  }
  @Post("forgot-password")
  @HttpCode(202)
  @ApiOperation({ summary: "Request a Firebase password-reset email" })
  forgot(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }
  @Post("resend-verification")
  @HttpCode(202)
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Request another Firebase verification email" })
  resend(@Headers("authorization") authorization?: string) {
    return this.auth.resendVerification(
      authorization?.replace(/^Bearer\s+/i, "") ?? "",
    );
  }
  @Get("me")
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the verified Firebase identity" })
  me(@CurrentUser() user: FirebaseIdentity) {
    return user;
  }
  @Get("session")
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return the current authenticated session identity",
  })
  session(@CurrentUser() user: FirebaseIdentity) {
    return user;
  }

  private setSessionCookie(
    response: Response,
    idToken: string,
    expiresIn: number,
  ): void {
    response.cookie(FIREBASE_SESSION_COOKIE, idToken, {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, expiresIn) * 1000,
    });
  }
}
