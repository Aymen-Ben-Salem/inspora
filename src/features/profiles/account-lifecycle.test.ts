import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  requestAccountDeletionWithStore,
  requestWebhookAccountDeletionWithStore,
} from "./account-lifecycle";

describe("account deletion lifecycle", () => {
  it("returns the existing pending job for an idempotent retry", async () => {
    const store = {
      request: vi.fn().mockResolvedValue({ jobId: "job-1", state: "pending" as const }),
    };
    await expect(requestAccountDeletionWithStore(store, "user-1"))
      .resolves.toEqual({ ok: true, value: { jobId: "job-1" } });
    await expect(requestAccountDeletionWithStore(store, "user-1"))
      .resolves.toEqual({ ok: true, value: { jobId: "job-1" } });
  });

  it("deduplicates verified deletion webhooks and ignores a missing account", async () => {
    const store = {
      record: vi.fn().mockResolvedValueOnce("missing" as const).mockResolvedValueOnce("duplicate" as const),
    };
    await expect(requestWebhookAccountDeletionWithStore(store, {
      eventId: "evt-1",
      userId: "user-missing",
    })).resolves.toEqual({ state: "missing" });
    await expect(requestWebhookAccountDeletionWithStore(store, {
      eventId: "evt-1",
      userId: "user-missing",
    })).resolves.toEqual({ state: "duplicate" });
  });
});
