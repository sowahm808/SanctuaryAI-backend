import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { WorkflowsService } from "./workflows.service";

type R = Record<string, unknown>;

enum WorkflowArea {
  Sermons = "sermons",
  Prayers = "prayers",
  Declarations = "declarations",
  Flyers = "flyers",
  Videos = "videos",
  Media = "media",
  Social = "social",
  Publishing = "publishing",
  Calendar = "calendar",
  Approvals = "approvals",
  Reviews = "reviews",
  Notifications = "notifications",
  Team = "team",
  Subscriptions = "subscriptions",
  Audit = "audit",
  Analytics = "analytics",
}

enum WorkflowAction {
  SubmitReview = "submit-review",
  Approve = "approve",
  RequestChanges = "request-changes",
  Reject = "reject",
  Schedule = "schedule",
  Retry = "retry",
  Cancel = "cancel",
  Disconnect = "disconnect",
  MarkRead = "mark-read",
}

enum WorkflowExportArea {
  Sermons = "sermons",
  Flyers = "flyers",
  Videos = "videos",
  Publishing = "publishing",
  Audit = "audit",
  Analytics = "analytics",
}

const workflowAreaPipe = new ParseEnumPipe(WorkflowArea);
const workflowActionPipe = new ParseEnumPipe(WorkflowAction);
const workflowExportAreaPipe = new ParseEnumPipe(WorkflowExportArea);

@ApiTags("Workflow APIs")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller()
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get(":area")
  list(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea) { return this.workflows.list(user, area); }
  @Post(":area")
  create(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Body() body: R) { return this.workflows.create(user, area, body); }
  @Get(":area/:id")
  get(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string) { return this.workflows.get(user, area, id); }
  @Patch(":area/:id")
  patch(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string, @Body() body: R) { return this.workflows.patch(user, area, id, body); }
  @Put(":area/:id/draft")
  draft(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string, @Body() body: R) { return this.workflows.draft(user, area, id, body); }
  @Get(":area/:id/versions")
  versions(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string) { return this.workflows.versions(user, area, id); }
  @Post(":area/:id/comments")
  comment(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string, @Body() body: R) { return this.workflows.comment(user, area, id, body); }
  @Post(":area/:id/exports")
  export(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowExportAreaPipe) area: WorkflowExportArea, @Param("id") id: string, @Body() body: R) { return this.workflows.exportJob(user, area, id, body); }
  @Post(":area/:id/generate")
  generate(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string, @Body() body: R) { return this.workflows.generate(user, area, id, body); }
  @Post(":area/:id/:action")
  action(@CurrentUser() user: FirebaseIdentity, @Param("area", workflowAreaPipe) area: WorkflowArea, @Param("id") id: string, @Param("action", workflowActionPipe) action: WorkflowAction, @Body() body: R) { return this.workflows.action(user, area, id, action, body); }
}
