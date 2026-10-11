import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/analytics/first-party/service", () => ({
  acceptAnalyticsBatch: vi.fn(async () => ({
    accepted: ["durable"],
    duplicate: [],
    excluded: [],
  })),
}));
import { POST } from "./route";
import { acceptAnalyticsBatch } from "@/analytics/first-party/service";
const request = (body: string, origin = "https://preview.example") =>
  new Request("https://preview.example/api/analytics/events", {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
it("requires same-origin and enforces a byte bound before invoking the collector", async () => {
  expect((await POST(request("{}", "https://other.example"))).status).toBe(403);
  expect((await POST(request("x".repeat(20481)))).status).toBe(413);
  expect(acceptAnalyticsBatch).not.toHaveBeenCalled();
});
it("returns a private durable acknowledgement and rejects malformed JSON", async () => {
  const response = await POST(request('{"events":[]}'));
  expect(await response.json()).toEqual({
    accepted: ["durable"],
    duplicate: [],
    excluded: [],
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await POST(request("{"))).status).toBe(400);
});
