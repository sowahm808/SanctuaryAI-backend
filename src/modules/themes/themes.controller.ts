import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { ThemeActionDto, ThemeCommentDto, ThemeDraftUpdateDto, ThemeInputDto, ThemeListQueryDto, ThemeOutputDto, ThemePatchInputDto, ThemeRefineDto } from "./dto";
import { ThemesService } from "./themes.service";
import { JobsService } from "../jobs/jobs.service";
@ApiTags("Themes") @ApiBearerAuth() @UseGuards(FirebaseAuthGuard) @Controller("themes")
export class ThemesController{constructor(private readonly themes:ThemesService, private readonly jobs:JobsService){}
 @Get() list(@CurrentUser() u:FirebaseIdentity,@Query() q:ThemeListQueryDto){return this.themes.list(u,q)}
 @Post() create(@CurrentUser() u:FirebaseIdentity,@Body() d:ThemeInputDto){return this.themes.create(u,d)}
 @Get(":id") get(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.get(u,id)}
 @Patch(":id") patch(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeDraftUpdateDto){return this.themes.patchDraft(u,id,d)}
 @Patch(":id/input") input(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemePatchInputDto){return this.themes.patchInput(u,id,d)}
 @Post(":id/generate") @HttpCode(HttpStatus.ACCEPTED) generate(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Headers("idempotency-key") key:string|undefined,@Body() d:Partial<ThemeRefineDto>){return this.themes.generate(u,id,d,key)}
 @Post(":id/refine") @HttpCode(HttpStatus.ACCEPTED) refine(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Headers("idempotency-key") key:string|undefined,@Body() d:ThemeRefineDto){return this.themes.refine(u,id,d,key)}
 @Post(":id/generation-jobs/:jobId/cancel") cancel(@CurrentUser() u:FirebaseIdentity,@Param("jobId") jobId:string){return this.jobs.cancel(u,jobId)}
 @Patch(":id/output") output(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeOutputDto){return this.themes.output(u,id,d)}
 @Get(":id/preview") preview(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.preview(u,id)}
 @Get(":id/versions") versions(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.versions(u,id)}
 @Get(":id/timeline") timeline(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.timeline(u,id)}
 @Post(":id/comments") comment(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeCommentDto){return this.themes.comment(u,id,d)}
 @Patch(":id/comments/:commentId") patchComment(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("commentId") cid:string,@Body() d:ThemeCommentDto){return this.themes.comment(u,id,d,cid)}
 @Post(":id/submit-review") submit(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"review",d)}
 @Post(":id/approve") approve(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"approve",d)}
 @Post(":id/request-changes") changes(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"changes_requested",d)}
 @Post(":id/reject") reject(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"rejected",d)}
 @Post(":id/templates") template(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.template(u,id)} }
