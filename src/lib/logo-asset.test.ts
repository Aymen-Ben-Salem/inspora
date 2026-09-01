import { describe, expect, it } from "vitest";

import {
  getAttachmentDisposition,
  getLogoAssetFileName,
} from "./logo-asset";

describe("logo asset response helpers", () => {
  it("uses the stored image MIME type for a safe filename", () => {
    expect(getLogoAssetFileName("North Star", "image/webp")).toBe(
      "North-Star.webp",
    );
    expect(getLogoAssetFileName("mark", "image/png; charset=binary")).toBe(
      "mark.png",
    );
  });

  it("falls back to PNG for an unknown content type", () => {
    expect(getLogoAssetFileName("", undefined)).toBe("logo.png");
  });

  it("builds an attachment disposition with ASCII and UTF-8 filenames", () => {
    expect(getAttachmentDisposition("café-logo.png")).toBe(
      `attachment; filename="caf--logo.png"; filename*=UTF-8''caf%C3%A9-logo.png`,
    );
  });
});
