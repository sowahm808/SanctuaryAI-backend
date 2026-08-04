import { ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FirebaseIdentity } from "../../database/firebase.service";
import { FirebaseService } from "../../database/firebase.service";
import { PERMISSIONS } from "../auth/auth.types";
import { CreateOrganizationDto } from "./dto";

export interface CreatedOrganizationResult {
  organization: {
    id: string;
    name: string;
    setupComplete: boolean;
    subscriptionStatus: string;
    timezone: string;
  };
  membership: {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    status: string;
    permissions: string[];
  };
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly firebase: FirebaseService) {}

  async create(
    user: FirebaseIdentity,
    dto: CreateOrganizationDto,
  ): Promise<CreatedOrganizationResult> {
    const existingUser = await this.firebase.getDocument(`users/${user.uid}`);
    if (typeof existingUser?.activeOrganizationId === "string") {
      throw new ConflictException({
        code: "organization_already_selected",
        message: "The user already has an active organization.",
      });
    }

    const now = new Date().toISOString();
    const organizationId = randomUUID();
    const membershipId = `${organizationId}_${user.uid}`;
    const name = dto.name.trim();
    const timezone = dto.timezone?.trim() || "UTC";
    const permissions = [...PERMISSIONS];

    const organization = {
      id: organizationId,
      name,
      setupComplete: false,
      subscriptionStatus: "TRIAL",
      timezone,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };
    const membership = {
      id: membershipId,
      organizationId,
      userId: user.uid,
      role: "ChurchAdministrator",
      status: "ACTIVE",
      permissions,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebase.putDocument(`organizations/${organizationId}`, organization);
    await this.firebase.putDocument(`memberships/${membershipId}`, membership);
    await this.firebase.putDocument(`users/${user.uid}`, {
      ...(existingUser ?? {}),
      uid: user.uid,
      email: existingUser?.email ?? user.email ?? "",
      displayName: existingUser?.displayName ?? user.name ?? "User",
      status: existingUser?.status ?? "ACTIVE",
      activeOrganizationId: organizationId,
      updatedAt: now,
    });

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        setupComplete: organization.setupComplete,
        subscriptionStatus: organization.subscriptionStatus,
        timezone: organization.timezone,
      },
      membership: {
        id: membership.id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        permissions: membership.permissions,
      },
    };
  }
}
