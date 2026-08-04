import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { ThemeActionDto, ThemeCommentDto, ThemeInputDto, ThemeOutputDto, ThemePatchInputDto, ThemeRefineDto } from "./dto";
import { ThemesService } from "./themes.service";
@ApiTags("Themes") @ApiBearerAuth() @UseGuards(FirebaseAuthGuard) @Controller("themes")
export class ThemesController{constructor(private readonly themes:ThemesService){}
 @Post() create(@CurrentUser() u:FirebaseIdentity,@Body() d:ThemeInputDto){return this.themes.create(u,d)}
 @Get(":id") get(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.get(u,id)}
 @Patch(":id/input") input(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemePatchInputDto){return this.themes.patchInput(u,id,d)}
 @Post(":id/generate") generate(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:Partial<ThemeRefineDto>){return this.themes.generate(u,id,d)}
 @Post(":id/refine") refine(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeRefineDto){return this.themes.refine(u,id,d)}
 @Post(":id/generation-jobs/:jobId/cancel") cancel(){return {status:"use_shared_endpoint", href:"/api/v1/jobs/:jobId/cancel"}}
 @Patch(":id/output") output(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeOutputDto){return this.themes.output(u,id,d)}
 @Get(":id/preview") preview(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.preview(u,id)}
 @Get(":id/versions") versions(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.versions(u,id)}
 @Post(":id/comments") comment(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeCommentDto){return this.themes.comment(u,id,d)}
 @Patch(":id/comments/:commentId") patchComment(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("commentId") cid:string,@Body() d:ThemeCommentDto){return this.themes.comment(u,id,d,cid)}
 @Post(":id/submit-review") submit(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"review",d)}
 @Post(":id/approve") approve(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"approve",d)}
 @Post(":id/request-changes") changes(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"changes_requested",d)}
 @Post(":id/reject") reject(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:ThemeActionDto){return this.themes.action(u,id,"rejected",d)}
 @Post(":id/templates") template(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.themes.template(u,id)} }
