import { Global, Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { TokenEncryptionService } from './token-encryption.service';
@Global() @Module({ providers: [TokenEncryptionService, FirebaseAuthGuard], exports: [TokenEncryptionService, FirebaseAuthGuard] })
export class SecurityModule {}
