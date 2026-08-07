import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardSummaryRepository } from "./dashboard-summary.repository";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardSummaryRepository],
})
export class DashboardModule {}
