import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
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
  constructor(private readonly auth: AuthService) {}
  @Post("register")
  @ApiOperation({ summary: "Create a Firebase email/password account" })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in through Firebase Authentication" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post("firebase")
  @HttpCode(200)
  @ApiOperation({ summary: "Authenticate with a Firebase ID token" })
  firebase(@Body() dto: FirebaseLoginDto) {
    return this.auth.loginWithFirebase(dto.idToken);
  }
  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a Firebase refresh token" })
  refresh(@Body() dto: RefreshDto) {
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
}
