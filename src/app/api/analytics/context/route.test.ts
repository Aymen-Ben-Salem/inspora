import { afterEach, expect, it, vi } from "vitest";
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
import { decodeDeliveryToken } from "@/analytics/first-party/context";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
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

it.each(["/websites", "/logos"])(
  "binds sidebar wordmark delivery when a detail dialog opens on %s",
  async (path) => {
    vi.stubEnv("ANALYTICS_KEY_ENCRYPTION_SECRET", "context-test-secret-with-at-least-32-characters");
    const campaignId = crypto.randomUUID(), versionId = crypto.randomUUID(), pageId = crypto.randomUUID();
    vi.mocked(getActiveSponsors).mockResolvedValueOnce([{
      id: campaignId, versionId, title: "Public sponsor", url: "https://sponsor.example",
      mediaType: "image", mediaWidth: 100, mediaHeight: 100, mediaAlt: "Sponsor",
    }]);
    const response = await POST(new Request("https://preview.example/api/analytics/context", {
      method: "POST", headers: { Origin: "https://preview.example" },
      body: JSON.stringify({ pageId, path }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const detail = body.tokens.find((token: { placement: string }) => token.placement === "detail");
    expect(detail).toBeDefined();
    expect(decodeDeliveryToken(detail.token)).toMatchObject({ pageId, path, campaignId, versionId, placement: "detail" });
  },
);
