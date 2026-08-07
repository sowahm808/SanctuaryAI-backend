import { Injectable, Logger } from "@nestjs/common";
import { FirebaseService } from "../../database/firebase.service";

export type DashboardSummaryDocument = Record<string, unknown>;

@Injectable()
export class DashboardSummaryRepository {
  private readonly logger = new Logger(DashboardSummaryRepository.name);

  constructor(private readonly firebase: FirebaseService) {}

  async findByOrganizationId(organizationId: string): Promise<DashboardSummaryDocument | null> {
    const summary = await this.firebase.findDocument(`dashboardSummaries/${organizationId}`);
    if (!summary) this.logger.debug({ event: "dashboard_summary.missing", organizationId });
    return summary;
  }

  async save(organizationId: string, summary: DashboardSummaryDocument): Promise<void> {
    await this.firebase.putDocument(`dashboardSummaries/${organizationId}`, {
      ...summary,
      organizationId,
    });
  }
}
