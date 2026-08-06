import { ConflictException, ValidationPipe } from "@nestjs/common";
import { FirebaseService } from "../src/database/firebase.service";
import { OrganizationsService } from "../src/modules/organizations/organizations.service";
import { CreateOrganizationDto } from "../src/modules/organizations/dto";

/* Jest mocks intentionally use dynamic asymmetric matcher values. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

const identity = {
  uid: "firebase-user",
  email: "user@example.com",
  emailVerified: true,
  name: "Ada",
  claims: {},
};

function firebaseMock(overrides: Partial<FirebaseService> = {}): FirebaseService {
  return {
    getDocument: jest.fn().mockResolvedValue({
      displayName: "Pastor Ada",
      email: "user@example.com",
      status: "ACTIVE",
    }),
    putDocument: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FirebaseService;
}

describe("OrganizationsService", () => {
  it("accepts and normalizes the onboarding form payload", async () => {
    const payload = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }).transform({
      setupMode: "create", name: "Salvation Church", primaryLogo: "churchlogo.jpg", primaryLogoAlt: "Church logo",
      secondaryLogo: "", secondaryLogoAlt: "", logoCropInstructions: "Make it fit", physicalAddress: "5909 Liverpool Street",
      digitalAddress: "", phone: "6823736649", email: "sowahm808@gmail.com", website: "", hashtags: "faith, salvation",
      socialChannels: "https://facebook.com/church", serviceDays: "Sunday", serviceTimes: "9am",
      teamInvitations: "teammate@example.com", socialConnectionNotes: "",
    }, { type: "body", metatype: CreateOrganizationDto }) as CreateOrganizationDto;

    expect(payload).toEqual(expect.objectContaining({
      primaryLogo: { fileName: "churchlogo.jpg", alt: "Church logo", cropInstructions: "Make it fit" },
      secondaryLogo: undefined,
      socialChannels: ["https://facebook.com/church"], serviceDays: ["Sunday"], serviceTimes: ["9am"],
      teamInvitations: ["teammate@example.com"], socialConnectionNotes: [], hashtags: ["faith", "salvation"],
    }));

    const firebase = firebaseMock();
    const result = await new OrganizationsService(firebase).create(identity, payload);
    expect(result.organization).toEqual(expect.objectContaining({
      contact: { physicalAddress: "5909 Liverpool Street", phone: "6823736649", email: "sowahm808@gmail.com" },
      defaultHashtags: ["faith", "salvation"],
    }));
  });

  it("creates an organization, owner membership, and selects it for the user", async () => {
    const firebase = firebaseMock();
    const result = await new OrganizationsService(firebase).create(identity, {
      name: " Grace Church ",
      timezone: "America/New_York",
      seniorPastor: " Pastor Ada ",
      slogan: " Grace changes everything ",
      primaryColor: "#3761a4",
      bibleTranslation: " NKJV ",
      doctrinalGuidelines: " Statement of faith ",
    });

    expect(result.organization).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "Grace Church",
        setupComplete: false,
        subscriptionStatus: "TRIAL",
        timezone: "America/New_York",
        seniorPastor: "Pastor Ada",
        slogan: "Grace changes everything",
        primaryColor: "#3761a4",
        bibleTranslation: "NKJV",
        doctrinalGuidelines: "Statement of faith",
      }),
    );
    expect(result.membership).toEqual(
      expect.objectContaining({
        organizationId: result.organization.id,
        userId: "firebase-user",
        role: "ChurchAdministrator",
        status: "ACTIVE",
        permissions: expect.arrayContaining(["settings.manage", "users.manage"]),
      }),
    );
    expect(firebase.putDocument).toHaveBeenCalledWith(
      `organizations/${result.organization.id}`,
      expect.objectContaining({
        name: "Grace Church",
        seniorPastor: "Pastor Ada",
        slogan: "Grace changes everything",
        primaryColor: "#3761a4",
        bibleTranslation: "NKJV",
        doctrinalGuidelines: "Statement of faith",
        createdBy: "firebase-user",
      }),
    );
    expect(firebase.putDocument).toHaveBeenCalledWith(
      `memberships/${result.organization.id}_firebase-user`,
      expect.objectContaining({ role: "ChurchAdministrator", status: "ACTIVE" }),
    );
    expect(firebase.putDocument).toHaveBeenCalledWith(
      "users/firebase-user",
      expect.objectContaining({ activeOrganizationId: result.organization.id }),
    );
  });

  it("rejects onboarding when the user already has an active organization", async () => {
    const firebase = firebaseMock({
      getDocument: jest.fn().mockResolvedValue({ activeOrganizationId: "org-1" }),
    });

    await expect(
      new OrganizationsService(firebase).create(identity, { name: "Grace Church" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(firebase.putDocument).not.toHaveBeenCalled();
  });
});
