import { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Request } from "express";
import request from "supertest";
import { FirebaseService } from "../src/database/firebase.service";
import { TenantRepository } from "../src/database/tenant-repository";
import { FirebaseAuthGuard } from "../src/security/firebase-auth.guard";
import { ApprovalWorkflowService } from "../src/modules/workflows/approval-workflow.service";
import { WorkflowsController } from "../src/modules/workflows/workflows.controller";
import { WorkflowsService } from "../src/modules/workflows/workflows.service";

type Document = Record<string, unknown>;

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest<Request & { user: object }>().user = { uid: "author-1", emailVerified: true, claims: {} };
    return true;
  }
}

describe("approval persistence workflow", () => {
  let app: INestApplication;
  const documents = new Map<string, Document>([
    ["users/author-1", { id: "author-1", activeOrganizationId: "org-1" }],
    ["memberships/org-1_author-1", { id: "org-1_author-1", organizationId: "org-1", userId: "author-1", status: "ACTIVE", role: "ChurchAdministrator", permissions: [] }],
  ]);

  const firebase = {
    getDocument: jest.fn((path: string) => Promise.resolve(documents.get(path))),
    putDocument: jest.fn((path: string, value: Document) => { documents.set(path, { ...value }); return Promise.resolve(); }),
    queryDocuments: jest.fn((collection: string, field: string, value: unknown) =>
      Promise.resolve([...documents.entries()].filter(([path, document]) => !path.slice(collection.length + 1).includes("/") && path.startsWith(`${collection}/`) && document[field] === value).map(([, document]) => ({ ...document })))),
    queryDocumentsPage: jest.fn((collection: string, field: string, value: unknown) => {
      const items = [...documents.entries()].filter(([path, document]) => !path.slice(collection.length + 1).includes("/") && path.startsWith(`${collection}/`) && document[field] === value).map(([, document]) => ({ ...document }));
      return Promise.resolve({ items, nextCursor: null, previousCursor: null, total: items.length });
    }),
  } as unknown as FirebaseService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        { provide: FirebaseService, useValue: firebase },
        TenantRepository,
        ApprovalWorkflowService,
        WorkflowsService,
      ],
    }).overrideGuard(FirebaseAuthGuard).useClass(TestAuthGuard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(async () => app.close());

  it("persists and lists an approval after a prayer version is submitted", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const created = await request(server).post("/api/prayers").send({ title: "Morning prayer" }).expect(201);
    const createdBody = created.body as unknown as Document;
    const prayerId = createdBody.id as string;
    const versioned = await request(server).put(`/api/prayers/${prayerId}/draft`).send({ expectedRevision: createdBody.revision, title: "Morning prayer v1" }).expect(200);
    const versionedBody = versioned.body as unknown as Document;

    await request(server).post(`/api/prayers/${prayerId}/submit-review`).send({ reviewerUserId: "reviewer-1" }).expect(201);

    const persisted = [...documents.entries()].find(([path]) => path.startsWith("approvals/"));
    expect(persisted?.[1]).toEqual(expect.objectContaining({
      organizationId: "org-1", resourceType: "prayers", resourceId: prayerId,
      versionId: versionedBody.currentVersionId, revision: versionedBody.revision,
      status: "pending", requestedByUserId: "author-1", reviewerUserId: "reviewer-1",
    }));
    expect(typeof persisted?.[1].createdAt).toBe("string");
    expect(typeof persisted?.[1].updatedAt).toBe("string");
    await request(server).get("/api/approvals").expect(200).expect((response) => {
      const body = response.body as unknown as Document;
      expect(body.items).toEqual([expect.objectContaining({ id: persisted?.[1].id, resourceId: prayerId, status: "pending" })]);
    });
    expect([...documents.keys()].some((path) => path.startsWith("notifications/"))).toBe(true);
  });
});
