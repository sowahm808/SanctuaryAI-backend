import { Test } from "@nestjs/testing";
import { FirebaseService } from "../src/database/firebase.service";
import { TenantRepository } from "../src/database/tenant-repository";
import { WorkflowsModule } from "../src/modules/workflows/workflows.module";
import { WorkflowsService } from "../src/modules/workflows/workflows.service";

describe("WorkflowsModule", () => {
  it("resolves WorkflowsService and its workflow approval dependency", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkflowsModule],
    })
      .overrideProvider(FirebaseService)
      .useValue({})
      .overrideProvider(TenantRepository)
      .useValue({})
      .compile();

    expect(moduleRef.get(WorkflowsService)).toBeDefined();

    await moduleRef.close();
  });
});
