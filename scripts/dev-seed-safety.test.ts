import { describe, expect, it } from "vitest";

import { assertDevelopmentDatabase } from "./dev-seed-safety";

const development =
  "postgresql://dev:secret@ep-development-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const production =
  "postgresql://prod:secret@ep-production.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("development seed database safety", () => {
  it("accepts distinct development and production endpoints", () => {
    expect(assertDevelopmentDatabase(development, production)).toEqual({
      database: "neondb",
      host: "ep-development.eu-central-1.aws.neon.tech",
    });
  });

  it("rejects the exact production connection", () => {
    expect(() => assertDevelopmentDatabase(production, production)).toThrow(
      "Refusing to seed the production database",
    );
  });

  it("treats pooled and unpooled URLs for one endpoint as the same database", () => {
    const pooledProduction = production.replace(
      "ep-production.",
      "ep-production-pooler.",
    );

    expect(() =>
      assertDevelopmentDatabase(pooledProduction, production),
    ).toThrow("Refusing to seed the production database");
  });

  it("rejects missing production comparison data", () => {
    expect(() => assertDevelopmentDatabase(development, undefined)).toThrow(
      "Production database URL is required",
    );
  });
});
