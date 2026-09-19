import { describe, expect, it } from "vitest";

import { validateCreateSubmissionInput } from "./validation";

describe("submission link validation", () => {
  it.each([
    [
      "design",
      "https://twitter.com/Inspora/status/1840000000000000000?s=20",
      "https://x.com/inspora/status/1840000000000000000",
    ],
    [
      "logo",
      "https://www.x.com/Inspora/status/1840000000000000001#fragment",
      "https://x.com/inspora/status/1840000000000000001",
    ],
  ] as const)("canonicalizes a %s X status URL", (kind, url, canonicalUrl) => {
    const result = validateCreateSubmissionInput({
      requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
      kind,
      source: "link",
      url,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind,
        source: "link",
        originalUrl: url,
        canonicalUrl,
        fingerprint: `url:${canonicalUrl}`,
      },
    });
  });

  it("accepts an absolute website URL and strips only its fragment from the fingerprint", () => {
    const result = validateCreateSubmissionInput({
      requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
      kind: "website",
      source: "link",
      url: "https://Example.com/showcase/?ref=profile#hero",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        originalUrl: "https://Example.com/showcase/?ref=profile#hero",
        canonicalUrl: "https://example.com/showcase/?ref=profile",
        fingerprint: "url:https://example.com/showcase/?ref=profile",
      },
    });
  });

  it("accepts only genuine Apple App Store listing hosts for icons", () => {
    expect(
      validateCreateSubmissionInput({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "app-icon",
        source: "link",
        url: "https://apps.apple.com/us/app/example/id123456789",
      }),
    ).toMatchObject({ ok: true });

    for (const url of [
      "https://apps.apple.com.evil.example/us/app/example/id123456789",
      "https://apps.apple.com:444/us/app/example/id123456789",
      "https://apple.com/us/app/example/id123456789",
      "https://apps.apple.com/us/developer/example/id123456789",
    ]) {
      expect(
        validateCreateSubmissionInput({
          requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
          kind: "app-icon",
          source: "link",
          url,
        }),
      ).toMatchObject({ ok: false, code: "invalid_input" });
    }
  });

  it("rejects X status links on nonstandard ports", () => {
    expect(
      validateCreateSubmissionInput({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "design",
        source: "link",
        url: "https://x.com:444/inspora/status/1840000000000000000",
      }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@example.com/work",
    "//example.com/work",
  ])("rejects unsafe website reference %s", (url) => {
    expect(
      validateCreateSubmissionInput({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "website",
        source: "link",
        url,
      }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("allows uploads only for designs and logos", () => {
    expect(
      validateCreateSubmissionInput({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "design",
        source: "upload",
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateCreateSubmissionInput({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "website",
        source: "upload",
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
  });
});
