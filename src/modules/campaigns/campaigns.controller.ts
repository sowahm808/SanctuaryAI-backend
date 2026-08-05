import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { CampaignsService } from "./campaigns.service";
import { CampaignDraftDto, CampaignWizardDto, CreateCampaignDto, DuplicateCampaignDto, GenerateDto, SectionActionDto, SectionMutationDto } from "./dto";
@ApiTags("Campaigns") @ApiBearerAuth() @UseGuards(FirebaseAuthGuard) @Controller("campaigns")
export class CampaignsController { constructor(private readonly campaigns: CampaignsService) {}
 @Post() create(@CurrentUser() u:FirebaseIdentity,@Body() d:CreateCampaignDto){return this.campaigns.create(u,d)}
 @Post("drafts") createDraft(@CurrentUser() u:FirebaseIdentity,@Body() d:CampaignDraftDto){return this.campaigns.createDraft(u,d)}
 @Get(":id") get(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.campaigns.get(u,id)}
 @Patch(":id/wizard") wizard(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:CampaignWizardDto){return this.campaigns.wizard(u,id,d)}
 @Post(":id/duplicate") duplicate(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:DuplicateCampaignDto){return this.campaigns.duplicate(u,id,d)}
 @Post(":id/archive") archive(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.campaigns.archive(u,id)}
 @Post(":id/restore") restore(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string){return this.campaigns.restore(u,id)}
 @Post(":id/generate") generate(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Body() d:GenerateDto){return this.campaigns.generate(u,id,d)}
 @Post(":id/sections/:scope/generate") generateSection(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:GenerateDto){return this.campaigns.generate(u,id,d,scope)}
 @Post(":id/sections/:scope/regenerate") regenerate(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:GenerateDto){return this.campaigns.generate(u,id,d,scope)}
 @Patch(":id/sections/:scope") mutateSection(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionMutationDto){return this.campaigns.mutateSection(u,id,scope,d)}
 @Get(":id/sections/:scope/versions") versions(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string){return this.campaigns.versions(u,id,scope)}
 @Post(":id/sections/:scope/submit-review") submit(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionActionDto){return this.campaigns.sectionAction(u,id,scope,"submit-review",d)}
 @Post(":id/sections/:scope/approve") approve(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionActionDto){return this.campaigns.sectionAction(u,id,scope,"approve",d)}
 @Post(":id/sections/:scope/reject") reject(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionActionDto){return this.campaigns.sectionAction(u,id,scope,"reject",d)}
 @Post(":id/sections/:scope/request-changes") changes(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionActionDto){return this.campaigns.sectionAction(u,id,scope,"request-changes",d)}
 @Post(":id/sections/:scope/unlock") unlock(@CurrentUser() u:FirebaseIdentity,@Param("id") id:string,@Param("scope") scope:string,@Body() d:SectionActionDto){return this.campaigns.sectionAction(u,id,scope,"unlock",d)} }
