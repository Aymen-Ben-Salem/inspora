import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertSponsorWriteRequest, readSponsorJson } from "./request-policy";
it("rejects cross-site writes and bounds JSON even when content-length is missing", async () => {
  const url = "https://preview.example/api/sponsorship/preparation";
  expect(() =>
    assertSponsorWriteRequest(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://foreign.example" },
      }),
    ),
  ).toThrow();
  await expect(
    readSponsorJson(
      new Request(url, {
        method: "PUT",
        headers: {
          origin: "https://preview.example",
          "content-type": "application/json",
        },
        body: '{"title":"' + "x".repeat(20000) + '"}',
      }),
    ),
  ).rejects.toThrow("too large");
  expect(
    await readSponsorJson(
      new Request(url, {
        method: "PUT",
        headers: {
          origin: "https://preview.example",
          "content-type": "application/json",
        },
        body: '{"title":"Example"}',
      }),
    ),
  ).toEqual({ title: "Example" });
});
