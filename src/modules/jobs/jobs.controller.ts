import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { JobsService } from "./jobs.service";

@ApiTags("Jobs")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}
  @Get(":id") get(@CurrentUser() user: FirebaseIdentity, @Param("id") id: string) { return this.jobs.get(user, id); }
  @Post(":id/cancel") cancel(@CurrentUser() user: FirebaseIdentity, @Param("id") id: string) { return this.jobs.cancel(user, id); }
}
