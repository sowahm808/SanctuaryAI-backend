import { Global, Module } from "@nestjs/common";
import { FirebaseService } from "./firebase.service";
import { TenantRepository } from "./tenant-repository";

@Global()
@Module({ providers: [FirebaseService, TenantRepository], exports: [FirebaseService, TenantRepository] })
export class DatabaseModule {}
