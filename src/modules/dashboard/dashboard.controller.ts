import { Controller, Get, Header, Headers, HttpCode, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RawResponse } from "../../common/envelope.interceptor";
import { requestContext } from "../../common/request-context";
import { FirebaseIdentity } from "../../database/firebase.service";
import { CurrentUser, FirebaseAuthGuard } from "../../security/firebase-auth.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RawResponse()
  @HttpCode(200)
  @Header("Cache-Control", "private, max-age=30")
  @ApiOperation({ summary: "Return the active organization's dashboard summary" })
  async summary(@CurrentUser() user: FirebaseIdentity, @Headers("if-none-match") ifNoneMatch: string | undefined, @Res() response: Response): Promise<void> {
    const result = await this.dashboard.summary(user);
    response.setHeader("ETag", result.etag);
    if (ifNoneMatch === result.etag) {
      response.status(304).send();
      return;
    }
    response.status(200).json({ data: result.summary, correlationId: requestContext.getStore()?.correlationId });
  }
}
