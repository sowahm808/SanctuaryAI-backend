import { FirebaseService } from "../src/database/firebase.service";
import { CampaignStatus } from "../src/database/firestore";
import { CampaignsService } from "../src/modules/campaigns/campaigns.service";

/* Jest method mocks are asserted without invoking the unbound method. */
/* eslint-disable @typescript-eslint/unbound-method */

const identity = { uid: "user-1", emailVerified: true, claims: {} };

function firebaseMock(): FirebaseService {
  return {
    getDocument: jest.fn((path: string) =>
      Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["campaigns.create"] }
            : undefined,
      ),
    ),
    putDocument: jest.fn().mockResolvedValue(undefined),
  } as unknown as FirebaseService;
}

describe("CampaignsService", () => {
  it("creates a campaign from the legacy POST /campaigns payload", async () => {
    const firebase = firebaseMock();
    const result = await new CampaignsService(firebase).create(identity, {
      month: "2026-08",
      focus: "Divine Advancement",
      scripture: "3 John 2",
      tone: "Pastoral",
      prayerQuantity: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({
        organizationId: "org-1",
        month: 8,
        year: 2026,
        monthLabel: "August 2026",
        spiritualFocus: "Divine Advancement",
        scriptures: ["3 John 2"],
        tone: "Pastoral",
        prayerQuantity: 20,
        status: CampaignStatus.Draft,
      }),
    );
    expect(firebase.putDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^campaigns\//),
      expect.objectContaining({ status: CampaignStatus.Draft }),
    );
  });
});
