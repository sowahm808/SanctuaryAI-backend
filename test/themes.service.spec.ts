import { FirebaseService } from "../src/database/firebase.service";
import { ThemesService } from "../src/modules/themes/themes.service";
import { ThemeGenerationService } from "../src/modules/themes/theme-generation.service";

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

    const generator = { generate: jest.fn() } as unknown as ThemeGenerationService;
    const result = await new ThemesService(firebase, generator).create(identity, {
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

  it("runs AI generation, saves the output, and completes the job", async () => {
    const theme = { id: "theme-1", organizationId: "org-1", revision: "rev-1", input: { topic: "Hope" }, currentOutput: {}, versions: [] };
    const firebase = {
      getDocument: jest.fn((path: string) => Promise.resolve(path === "themes/theme-1" ? theme : path === "memberships/org-1_user-1" ? { status: "ACTIVE", permissions: ["themes.write"] } : undefined)),
      putDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirebaseService;
    const generated = { title: "Living Hope", subtitle: "", scriptures: ["1 Peter 1:3"], explanation: "Hope in Christ", pastoralIntroduction: "Welcome", objectives: ["Grow in hope"], weeklyDirection: ["Week 1: Hope"], confession: "I have hope", declaration: "We live in hope", hashtags: ["#LivingHope"], flyerHeadline: "Living Hope", designConcept: "Sunrise" };
    const generator = { generate: jest.fn().mockResolvedValue(generated) } as unknown as ThemeGenerationService;

    const result = await new ThemesService(firebase, generator).generate(identity, "theme-1");

    expect(result).toEqual(expect.objectContaining({ status: "completed", progress: 100, sourceRevision: "rev-1" }));
    expect(generator.generate).toHaveBeenCalledWith(theme.input, theme.currentOutput, undefined);
    expect(firebase.putDocument).toHaveBeenCalledWith("themes/theme-1", expect.objectContaining({ currentOutput: generated }));
    expect(firebase.putDocument).toHaveBeenCalledWith(expect.stringMatching(/^asyncJobs\//), expect.objectContaining({ status: "completed", progress: 100 }));
  });
});
