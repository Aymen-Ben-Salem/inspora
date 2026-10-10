import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  drain: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/features/sponsorship/webhook", () => ({
  recordStripeWebhook: mocks.record,
}));
vi.mock("@/features/sponsorship/jobs", () => ({
  drainSponsorJobs: mocks.drain,
}));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST } from "./route";
beforeEach(() => vi.resetAllMocks());
it("passes the untouched signed body and acknowledges only durable acceptance", async () => {
  const raw = '{ "test": true }\n';
  mocks.record.mockResolvedValue({ accepted: true, duplicate: false });
  const response = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: raw,
    }),
  );
  expect(mocks.record).toHaveBeenCalledWith(raw, "sig");
  expect(response.status).toBe(202);
  expect(mocks.after).toHaveBeenCalled();
});
it("rejects invalid signatures and returns a retryable error for storage failure", async () => {
  const request = () =>
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    });
  mocks.record.mockResolvedValue({ accepted: false });
  expect((await POST(request())).status).toBe(400);
  mocks.record.mockRejectedValue(Error());
  expect((await POST(request())).status).toBe(503);
  expect(mocks.after).not.toHaveBeenCalled();
});
