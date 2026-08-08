import { Global, Module } from "@nestjs/common";
import { ApprovalRepository } from "./approval.repository";
import { ApprovalWorkflowService } from "./approval-workflow.service";

@Global()
@Module({ providers: [ApprovalRepository, ApprovalWorkflowService], exports: [ApprovalRepository, ApprovalWorkflowService] })
export class ApprovalPersistenceModule {}
