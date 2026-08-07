import { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Request } from "express";
import request from "supertest";
import { EnvelopeInterceptor } from "../src/common/envelope.interceptor";
import { FirebaseAuthGuard } from "../src/security/firebase-auth.guard";
import { WorkflowsController } from "../src/modules/workflows/workflows.controller";
import { WorkflowsService } from "../src/modules/workflows/workflows.service";

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest<Request & { user: object }>().user = { uid: "user-1", emailVerified: true, claims: {} };
    return true;
  }
}

describe("workflow detail routes", () => {
  let app: INestApplication;
  const workflows = {
    get: jest.fn().mockResolvedValue({ id: "resource-1" }),
    versions: jest.fn().mockResolvedValue({ items: [] }),
    timeline: jest.fn().mockResolvedValue({ items: [] }),
    approval: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [WorkflowsController], providers: [{ provide: WorkflowsService, useValue: workflows }] })
      .overrideGuard(FirebaseAuthGuard).useClass(TestAuthGuard).compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    await app.init();
  });
  afterAll(async () => app.close());

  it.each(["prayers", "declarations"])("returns resource, version, timeline, and approval states for %s", async (area) => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get(`/${area}/resource-1`).expect(200, { data: { id: "resource-1" }, meta: {} });
    await request(server).get(`/${area}/resource-1/versions`).expect(200, { data: { items: [] }, meta: {} });
    await request(server).get(`/${area}/resource-1/timeline`).expect(200, { data: { items: [] }, meta: {} });
    await request(server).get(`/${area}/resource-1/approval`).expect(200, { data: null, meta: {} });
    expect(workflows.get).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
    expect(workflows.versions).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
    expect(workflows.timeline).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
    expect(workflows.approval).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1" }), area, "resource-1");
  });
});
