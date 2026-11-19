import { describe, expect, it } from "vitest";
import { logoQualityNotice, recordingQualityNotice } from "./upload-quality";

describe("logo quality notice", () => {
  it("stays quiet for large non-JPEG logos and standard icons", () => {
    expect(logoQualityNotice({ logoKind: "logo", width: 2400, height: 1350, sourceMimeType: "image/png" })).toBeNull();
    expect(logoQualityNotice({ logoKind: "icon", width: 1024, height: 1024, sourceMimeType: "image/png" })).toBeNull();
  });

  it("notes small logos and JPEG sources", () => {
    expect(logoQualityNotice({ logoKind: "logo", width: 1200, height: 675, sourceMimeType: "image/png" })).toContain("1200 × 675 px");
    expect(logoQualityNotice({ logoKind: "icon", width: 512, height: 512 })).toContain("1024 px or larger");
    const both = logoQualityNotice({ logoKind: "logo", width: 1000, height: 562, sourceMimeType: "image/jpeg" });
    expect(both).toContain("1000 × 562 px");
    expect(both).toContain("JPEG");
  });
});

describe("recording quality notice", () => {
  it("flags today's narrow, heavily compressed recordings", () => {
    // Greptile: 1716x1076, 2.6 MB over 21.3 s, about 1 Mbps.
    const notice = recordingQualityNotice({ width: 1716, height: 1076, sizeBytes: 2_606_808, durationSeconds: 21.3 });
    expect(notice).toContain("1716 px wide");
    expect(notice).toContain("about 1.0 Mbps");
  });

  it("stays quiet for a Retina capture at a healthy bitrate", () => {
    // 2880x1800 for 30 s at 12 Mbps is 45 MB.
    expect(recordingQualityNotice({ width: 2880, height: 1800, sizeBytes: 45_000_000, durationSeconds: 30 })).toBeNull();
  });

  it("skips the bitrate check when the duration is unknown", () => {
    expect(recordingQualityNotice({ width: 2560, height: 1600, sizeBytes: 1000, durationSeconds: 0 })).toBeNull();
  });
});
