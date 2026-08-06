import { FirebaseService } from "../src/database/firebase.service";
import { ThemesService } from "../src/modules/themes/themes.service";

/* Jest method mocks are asserted without invoking the unbound method. */
/* eslint-disable @typescript-eslint/unbound-method */

const identity = { uid: "user-1", emailVerified: true, claims: {} };

describe("ThemesService", () => {
  it("accepts and normalizes the theme workflow brief payload", async () => {
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(
        path === "users/user-1"
          ? { activeOrganizationId: "org-1" }
          : path === "memberships/org-1_user-1"
            ? { status: "ACTIVE", permissions: ["themes.write"] }
            : undefined,
      )),
      putDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirebaseService;

    const result = await new ThemesService(firebase).create(identity, {
      kind: "themes",
      brief: {
        month_and_year: "September 2026",
        topic: "Born to win",
        main_scripture: " Psalm 18:19",
      },
    });

    expect(result.input).toEqual(expect.objectContaining({
      kind: "themes",
      date: "September 2026",
      topic: "Born to win",
      scriptures: ["Psalm 18:19"],
    }));
    expect(firebase.putDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^themes\//),
      result,
    );
  });
});
