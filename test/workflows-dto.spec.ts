import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { WorkflowMutationDto } from "../src/modules/workflows/dto";

describe("WorkflowMutationDto", () => {
  it.each([1, 42])("normalizes numeric expectedRevision %s to a string", async (expectedRevision) => {
    const dto = plainToInstance(WorkflowMutationDto, { expectedRevision });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.expectedRevision).toBe(String(expectedRevision));
  });

  it("still rejects non-scalar expected revisions", async () => {
    const dto = plainToInstance(WorkflowMutationDto, { expectedRevision: { value: 1 } });

    await expect(validate(dto)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "expectedRevision" }),
    ]));
  });
});
