import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { ApprovalPersistenceModule } from "./approval-persistence.module";

@Module({ imports: [DatabaseModule, ApprovalPersistenceModule], controllers: [WorkflowsController], providers: [WorkflowsService] })
export class WorkflowsModule {}
