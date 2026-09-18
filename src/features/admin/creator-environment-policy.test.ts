import { describe, expect, it } from "vitest";

import {
  isCreatorVisibleInEnvironment,
  isDevelopmentFixtureCreator,
  shouldLockExistingCreator,
} from "./creator-environment-policy";

describe("creator environment policy", () => {
  it.each(["dev-field-office", " DEV-NORTH-PRACTICE "])(
    "recognizes development fixture handle %s",
    (handle) => {
      expect(isDevelopmentFixtureCreator(handle)).toBe(true);
    },
  );

  it("shows development fixture creators only in Development", () => {
    expect(isCreatorVisibleInEnvironment("dev-field-office", "development")).toBe(true);
    expect(isCreatorVisibleInEnvironment("dev-field-office", "preview")).toBe(false);
    expect(isCreatorVisibleInEnvironment("dev-field-office", "production")).toBe(false);
    expect(isCreatorVisibleInEnvironment("real-studio", "preview")).toBe(true);
  });

  it("locks only existing Preview creators", () => {
    expect(
      shouldLockExistingCreator(
        { id: "creator-id", recordOrigin: "mirrored" },
        "preview",
      ),
    ).toBe(true);
    expect(
      shouldLockExistingCreator(
        { id: "creator-id", recordOrigin: "preview" },
        "preview",
      ),
    ).toBe(false);
    expect(shouldLockExistingCreator(undefined, "preview")).toBe(false);
    expect(
      shouldLockExistingCreator(
        { id: "creator-id", recordOrigin: "mirrored" },
        "development",
      ),
    ).toBe(false);
    expect(
      shouldLockExistingCreator(
        { id: "creator-id", recordOrigin: "mirrored" },
        "production",
      ),
    ).toBe(false);
  });
});
