import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/data/sponsor-repository", () => ({
  getActiveSponsors: vi.fn(async () => []),
}));
vi.mock("@/analytics/first-party/service", () => ({
  analyticsActor: async () => ({ userId: null, excluded: false }),
  requestAnalyticsDisabled: (request: Request) =>
    request.headers.get("dnt") === "1",
}));
import { POST } from "./route";
import { getActiveSponsors } from "@/data/sponsor-repository";
it("suppresses opt-out and rejects private context before reading any campaigns", async () => {
  const request = (body: object, dnt = "0") =>
    new Request("https://preview.example/api/analytics/context", {
      method: "POST",
      headers: { Origin: "https://preview.example", dnt },
      body: JSON.stringify(body),
    });
  expect(await (await POST(request({}, "1"))).json()).toEqual({
    disabled: true,
  });
  expect(
    (
      await POST(
        request({ pageId: crypto.randomUUID(), path: "/sponsor/dashboard" }),
      )
    ).status,
  ).toBe(400);
  expect(getActiveSponsors).not.toHaveBeenCalled();
});
