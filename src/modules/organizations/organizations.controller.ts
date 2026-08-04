import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { CreateOrganizationDto } from "./dto";
import { CreatedOrganizationResult, OrganizationsService } from "./organizations.service";

@ApiTags("Organizations")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: "Create an organization for the authenticated user" })
  create(
    @CurrentUser() user: FirebaseIdentity,
    @Body() dto: CreateOrganizationDto,
  ): Promise<CreatedOrganizationResult> {
    return this.organizations.create(user, dto);
  }
}
