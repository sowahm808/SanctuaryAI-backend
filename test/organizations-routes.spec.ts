import { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Request } from "express";
import request from "supertest";
import { EnvelopeInterceptor } from "../src/common/envelope.interceptor";
import { OrganizationsController } from "../src/modules/organizations/organizations.controller";
import { OrganizationsService } from "../src/modules/organizations/organizations.service";
import { FirebaseAuthGuard } from "../src/security/firebase-auth.guard";

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest<Request & { user: object }>().user = {
      uid: "user-1",
      emailVerified: true,
      claims: {},
    };
    return true;
  }
}

describe("organization brand-kit routes", () => {
  let app: INestApplication;
  const organizations = {
    brandKit: jest.fn().mockResolvedValue({ organizationId: "org-1", colorPalette: [], fontFamilies: [] }),
    patchBrandKit: jest.fn().mockResolvedValue({ organizationId: "org-1", colorPalette: ["#112233"], fontFamilies: [] }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: organizations }],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useClass(TestAuthGuard)
      .compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    await app.init();
  });

  afterAll(async () => app.close());

  it.each(["/organizations/brand-kit", "/organizations/current/brand-kit"])(
    "gets the active brand kit at %s",
    async (path) => {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get(path)
        .expect(200, { data: { organizationId: "org-1", colorPalette: [], fontFamilies: [] }, meta: {} });
    },
  );

  it.each(["/organizations/brand-kit", "/organizations/current/brand-kit"])(
    "updates the active brand kit at %s",
    async (path) => {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .patch(path)
        .send({ colorPalette: ["#112233"] })
        .expect(200, { data: { organizationId: "org-1", colorPalette: ["#112233"], fontFamilies: [] }, meta: {} });
    },
  );
});
