import { Injectable, UnauthorizedException } from "@nestjs/common";
import { FirebaseService } from "../../database/firebase.service";
import { LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(private readonly firebase: FirebaseService) {}

  async register(dto: RegisterDto) {
    const response = await this.firebase.signUp(
      dto.email.trim().toLowerCase(),
      dto.password,
      dto.displayName.trim(),
    );
    const identity = await this.firebase.verifyIdToken(response.idToken);
    await this.firebase.createUserProfile(identity, dto.displayName.trim());
    await this.firebase.sendVerification(response.idToken);
    return this.authResponse(response, identity);
  }

  async login(dto: LoginDto) {
    try {
      const response = await this.firebase.signIn(
        dto.email.trim().toLowerCase(),
        dto.password,
      );
      const identity = await this.firebase.verifyIdToken(response.idToken);
      return this.authResponse(response, identity);
    } catch {
      throw new UnauthorizedException("Invalid credentials");
    }
  }

  async loginWithFirebase(idToken: string) {
    return this.exchangeFirebaseToken(idToken);
  }

  async exchangeFirebaseToken(idToken: string) {
    const identity = await this.firebase.verifyIdToken(idToken);
    await this.firebase.ensureUserProfile(identity);

    return {
      user: identity,
      tokens: {
        accessToken: idToken,
        expiresIn: Math.max(
          0,
          Number(identity.claims.exp ?? 0) - Math.floor(Date.now() / 1000),
        ),
      },
    };
  }

  async refresh(refreshToken: string) {
    const response = await this.firebase.refresh(refreshToken);
    const identity = await this.firebase.verifyIdToken(response.idToken);
    return this.authResponse(response, identity);
  }

  async forgotPassword(email: string) {
    try {
      await this.firebase.sendPasswordReset(email.trim().toLowerCase());
    } catch {
      /* Enumeration-safe by design. */
    }
    return { accepted: true };
  }

  resendVerification(idToken: string) {
    return this.firebase
      .sendVerification(idToken)
      .then(() => ({ accepted: true }));
  }

  private authResponse(
    response: { idToken: string; refreshToken: string; expiresIn: string },
    identity: {
      uid: string;
      email?: string;
      emailVerified: boolean;
      name?: string;
    },
  ) {
    return {
      user: identity,
      tokens: {
        accessToken: response.idToken,
        refreshToken: response.refreshToken,
        expiresIn: Number(response.expiresIn),
      },
    };
  }
}
