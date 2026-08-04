import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  CurrentUser,
  FIREBASE_SESSION_COOKIE,
  FirebaseAuthGuard,
} from "../../security/firebase-auth.guard";
import { FirebaseIdentity } from "../../database/firebase.service";
import { AuthService } from "./auth.service";
import { RawResponse } from "../../common/envelope.interceptor";
import {
  EmailDto,
  EmailVerifyDto,
  FirebaseLoginDto,
  InvitationAcceptDto,
  LoginDto,
  MfaVerifyDto,
  PasswordResetDto,
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
  ) {
    return this.auth.register(dto);
  }
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in through Firebase Authentication" })
  async login(
    @Body() dto: LoginDto,
  ) {
    return this.auth.login(dto);
  }
  @Post("firebase")
  @HttpCode(200)
  @RawResponse()
  @ApiOperation({ summary: "Authenticate with a Firebase ID token" })
  async firebase(
    @Body() dto: FirebaseLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateStateChangingOrigin(request);
    const exchange = await this.auth.loginWithFirebase(dto.idToken);
    this.preventCaching(response);
    if (exchange.sessionToken) this.setSessionCookie(response, exchange.sessionToken);
    return exchange.result;
  }
  @Post("firebase/exchange")
  @HttpCode(200)
  @RawResponse()
  @ApiOperation({ summary: "Exchange a Firebase ID token for an app session" })
  async exchangeFirebaseToken(
    @Body() dto: FirebaseLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateStateChangingOrigin(request);
    const exchange = await this.auth.exchangeFirebaseToken(dto.idToken);
    this.preventCaching(response);
    if (exchange.sessionToken) this.setSessionCookie(response, exchange.sessionToken);
    return exchange.result;
  }
  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a Firebase refresh token" })
  async refresh(
    @Body() dto: RefreshDto,
  ) {
    return this.auth.refresh(dto.refreshToken);
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
  @RawResponse()
  @ApiOperation({
    summary: "Return the current authenticated session identity",
  })
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.preventCaching(response);
    return this.auth.restoreSession(this.readSessionCookie(request));
  }


  @Post("mfa/verify")
  @HttpCode(200)
  @RawResponse()
  verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateStateChangingOrigin(request);
    this.preventCaching(response);
    return this.auth.verifyMfa(dto.challengeId, dto.code);
  }

  @Post("invitations/accept")
  @HttpCode(200)
  @RawResponse()
  acceptInvitation(
    @Body() dto: InvitationAcceptDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateStateChangingOrigin(request);
    this.preventCaching(response);
    return this.auth.acceptInvitation(dto);
  }

  @Post("password/reset")
  @HttpCode(204)
  @RawResponse()
  async resetPassword(
    @Body() dto: PasswordResetDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.validateStateChangingOrigin(request);
    this.preventCaching(response);
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post("email/verify")
  @HttpCode(204)
  @RawResponse()
  async verifyEmail(
    @Body() dto: EmailVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.validateStateChangingOrigin(request);
    this.preventCaching(response);
    await this.auth.verifyEmail(dto.token);
  }

  @Post("logout")
  @HttpCode(204)
  @RawResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.validateStateChangingOrigin(request);
    await this.auth.logout(this.readSessionCookie(request));
    this.preventCaching(response);
    response.clearCookie(FIREBASE_SESSION_COOKIE, this.cookieOptions());
  }

  private validateStateChangingOrigin(request: Request): void {
    const origin = request.header("origin");
    const referer = request.header("referer");
    if (!origin && !referer) return;
    const allowed = this.config
      .getOrThrow<string>("CORS_ORIGINS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    let candidate = origin ?? "";
    if (!candidate && referer) {
      try {
        candidate = new URL(referer).origin;
      } catch {
        candidate = "";
      }
    }
    if (!allowed.includes(candidate)) {
      throw new BadRequestException({
        code: "csrf_origin_invalid",
        message: "The request could not be completed.",
      });
    }
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(FIREBASE_SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax" as const,
      path: "/api",
    };
  }

  private readSessionCookie(request: Request): string {
    const value = (request.cookies as Record<string, unknown> | undefined)?.[
      FIREBASE_SESSION_COOKIE
    ];
    return typeof value === "string" ? value : "";
  }

  private preventCaching(response: Response): void {
    response.setHeader("Cache-Control", "no-store");
  }
}
