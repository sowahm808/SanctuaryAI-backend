import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ThemeActionDto, ThemeDraftUpdateDto } from "../src/modules/themes/dto";

describe("ThemeDraftUpdateDto contract", () => {
  it.each([
    { expectedRevision: 3, topic: "Hope" },
    { revision: "rev-3", draft: { topic: "Hope" } },
  ])("accepts the canonical and legacy revision payload shapes", async (payload) => {
    await expect(validate(plainToInstance(ThemeDraftUpdateDto, payload), { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it("rejects unknown frontend-only properties", async () => {
    const errors = await validate(plainToInstance(ThemeDraftUpdateDto, { expectedRevision: 3, unexpected: true }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual([expect.objectContaining({ property: "unexpected" })]);
  });
});

describe("ThemeActionDto contract", () => {
  it("accepts the reviewer selected by the approval UI", async () => {
    await expect(validate(plainToInstance(ThemeActionDto, { revision: "rev-3", reviewerUserId: "reviewer-1" }), { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });
});
