import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSponsorAnalyticsService } from "./analytics-service";
it("denies foreign campaign and version filters before reading reports", async () => {
  const read = vi.fn(),
    service = createSponsorAnalyticsService({
      actor: async () => ({
        userId: "owner",
        accountId: "own",
        state: "inactive",
      }),
      owns: async () => false,
      read,
    });
  await expect(
    service({
      range: "30d",
      campaignId: "c886bc8d-2d20-4e31-a05c-6a0a1f416444",
    }),
  ).rejects.toThrow("Owned report filter");
  expect(read).not.toHaveBeenCalled();
});
it("allows former accounts to read history and rejects revoked accounts", async () => {
  const read = vi.fn().mockResolvedValue({
    status: "unavailable",
    source: "Inspora accepted events",
  });
  const actor = vi.fn().mockResolvedValue({
    userId: "owner",
    accountId: "own",
    state: "inactive",
  });
  const service = createSponsorAnalyticsService({
    actor,
    owns: async () => true,
    read,
  });
  expect(await service({ range: "7d" })).toEqual({
    status: "unavailable",
    source: "Inspora accepted events",
  });
  actor.mockResolvedValueOnce({
    userId: "owner",
    accountId: "own",
    state: "revoked",
  });
  await expect(service({ range: "7d" })).rejects.toThrow(
    "Sponsor report access",
  );
  expect(read).toHaveBeenCalledTimes(1);
});
