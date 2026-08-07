import { ValidationPipe } from "@nestjs/common";
import { ThemeListQueryDto } from "../src/modules/themes/dto";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: 422,
});

const validate = (query: Record<string, unknown>) => pipe.transform(query, {
  type: "query",
  metatype: ThemeListQueryDto,
  data: "",
});

describe("ThemeListQueryDto", () => {
  it("defaults every optional collection parameter", async () => {
    await expect(validate({})).resolves.toEqual({ limit: 20, sort: "updatedAt", direction: "desc" });
  });

  it("accepts the production list query and transforms limit", async () => {
    await expect(validate({ limit: "20", sort: "updatedAt", direction: "desc" })).resolves.toEqual({
      limit: 20,
      sort: "updatedAt",
      direction: "desc",
    });
  });

  it.each([
    { sort: "organizationId" },
    { direction: "sideways" },
    { limit: "0" },
    { limit: "101" },
  ])("rejects unsupported query values: %p", async (query) => {
    await expect(validate(query)).rejects.toMatchObject({ status: 422 });
  });
});
