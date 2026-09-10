import { describe, expect, it } from "vitest";

import packageMetadata from "../../package.json";

describe("build command safety", () => {
  it("keeps the ordinary application build available alongside the guarded Preview path", () => {
    expect("prebuild" in packageMetadata.scripts).toBe(false);
    expect(packageMetadata.scripts.build).toBe("next build");
    expect(packageMetadata.scripts["build:preview"]).toBe(
      "tsx scripts/build-preview.ts",
    );
  });

  it("exposes standalone development and Preview fingerprint preflights", () => {
    expect(packageMetadata.scripts["env:check:development"]).toBe(
      "tsx scripts/check-environment.ts development",
    );
    expect(packageMetadata.scripts["env:check:preview"]).toBe(
      "tsx scripts/check-environment.ts preview",
    );
  });
});
