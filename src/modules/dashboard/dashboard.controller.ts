import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  FirebaseAuthGuard,
} from "../../security/firebase-auth.guard";
import { FirebaseIdentity } from "../../database/firebase.service";

interface DashboardSummary {
  user: {
    uid: string;
    email?: string;
    displayName?: string;
    emailVerified: boolean;
  };
  metrics: {
    activeCampaigns: number;
    pendingApprovals: number;
    scheduledSocialPosts: number;
    aiGenerationsThisMonth: number;
  };
  recentActivity: unknown[];
}

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("dashboard")
export class DashboardController {
  @Get("summary")
  @ApiOperation({ summary: "Return the authenticated user's dashboard summary" })
  summary(@CurrentUser() user: FirebaseIdentity): DashboardSummary {
    return {
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.name,
        emailVerified: user.emailVerified,
      },
      metrics: {
        activeCampaigns: 0,
        pendingApprovals: 0,
        scheduledSocialPosts: 0,
        aiGenerationsThisMonth: 0,
      },
      recentActivity: [],
    };
  }
}
