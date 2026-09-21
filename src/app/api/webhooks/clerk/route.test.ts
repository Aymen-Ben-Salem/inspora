import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  requestWebhookAccountDeletion: vi.fn(),
}));
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: mocks.verifyWebhook }));
vi.mock("@/features/profiles/account-lifecycle", () => ({
  requestWebhookAccountDeletion: mocks.requestWebhookAccountDeletion,
}));

import { POST } from "./route";

beforeEach(() => vi.resetAllMocks());

it("rejects an unsigned webhook without trusting its user id", async () => {
  mocks.verifyWebhook.mockRejectedValue(new Error("bad signature"));
  const response = await POST(new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify({ type: "user.deleted", data: { id: "victim" } }),
  }));
  expect(response.status).toBe(400);
  expect(mocks.requestWebhookAccountDeletion).not.toHaveBeenCalled();
});

it("queues a verified user.deleted event by its signed event id", async () => {
  mocks.verifyWebhook.mockResolvedValue({ type: "user.deleted", data: { id: "user-1" } });
  const response = await POST(new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: { "svix-id": "evt-1" },
  }));
  expect(response.status).toBe(202);
  expect(mocks.requestWebhookAccountDeletion).toHaveBeenCalledWith({
    eventId: "evt-1",
    userId: "user-1",
  });
});
