import { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { FirebaseAuthGuard } from "../src/security/firebase-auth.guard";
import { WorkflowsController } from "../src/modules/workflows/workflows.controller";
import { WorkflowsService } from "../src/modules/workflows/workflows.service";

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = { uid: "user-1", emailVerified: true, claims: {} };
    return true;
  }
}

describe("workflow detail routes", () => {
  let app: INestApplication;
  const workflows = { timeline: jest.fn().mockResolvedValue({ items: [] }), approval: jest.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [WorkflowsController], providers: [{ provide: WorkflowsService, useValue: workflows }] })
      .overrideGuard(FirebaseAuthGuard).useClass(TestAuthGuard).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it.each(["prayers", "declarations"])("returns normal empty timeline and approval states for %s", async (area) => {
    await request(app.getHttpServer()).get(`/${area}/resource-1/timeline`).expect(200, { items: [] });
    await request(app.getHttpServer()).get(`/${area}/resource-1/approval`).expect(200, "");
    expect(workflows.timeline).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
    expect(workflows.approval).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
  });
});
