import { describe, expect, it } from "vitest";

describe("import order", () => {
  it("works when @kvesto/schema is loaded before @hono/zod-openapi", async () => {
    // Load the shared schemas first, as an app does when it imports `kvesto` and then `@kvesto/server`.
    await import("@kvesto/schema");
    const { createApp, createSqliteDb, drizzleRepository } = await import("../src/index.js");
    const app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")) });
    const doc = (await (await app.request("/openapi.json")).json()) as { components: { schemas: object } };
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["Survey", "SurveyResponse"]));
  });
});
