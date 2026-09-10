import { describe, expect, it } from "vitest";

import packageMetadata from "../../package.json";
import { plainBuildRejection } from "../reject-plain-build";

describe("build command safety", () => {
  it("rejects a plain application build and exposes only the guarded Preview path", () => {
    expect("prebuild" in packageMetadata.scripts).toBe(false);
    expect(packageMetadata.scripts.build).toBe("tsx scripts/reject-plain-build.ts");
    expect(packageMetadata.scripts["build:preview"]).toBe(
      "tsx scripts/build-preview.ts",
    );
    expect(() => plainBuildRejection()).toThrow("npm run build:preview");
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
