import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { WorkflowsService } from "./workflows.service";

type R = Record<string, unknown>;

@ApiTags("Workflow APIs")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller()
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)")
  list(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string) { return this.workflows.list(user, area); }
  @Post(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)")
  create(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Body() body: R) { return this.workflows.create(user, area, body); }
  @Get(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id")
  get(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string) { return this.workflows.get(user, area, id); }
  @Patch(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id")
  patch(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string, @Body() body: R) { return this.workflows.patch(user, area, id, body); }
  @Put(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id/draft")
  draft(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string, @Body() body: R) { return this.workflows.draft(user, area, id, body); }
  @Get(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id/versions")
  versions(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string) { return this.workflows.versions(user, area, id); }
  @Post(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id/comments")
  comment(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string, @Body() body: R) { return this.workflows.comment(user, area, id, body); }
  @Post(":area(sermons|prayers|declarations|flyers|videos|media|social|publishing|calendar|reviews|notifications|team|subscriptions|audit|analytics)/:id/:action(submit-review|approve|request-changes|reject|schedule|retry|cancel|disconnect|mark-read)")
  action(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string, @Param("action") action: string, @Body() body: R) { return this.workflows.action(user, area, id, action, body); }
  @Post(":area(sermons|flyers|videos|publishing|audit|analytics)/:id/exports")
  export(@CurrentUser() user: FirebaseIdentity, @Param("area") area: string, @Param("id") id: string, @Body() body: R) { return this.workflows.exportJob(user, area, id, body); }
}
