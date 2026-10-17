import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSponsorAnalyticsService, metricsFilterSchema } from "./analytics-service";
it("accepts actual calendar dates and rejects invalid or conflicting report dates", () => {
  expect(metricsFilterSchema.safeParse({ range: "7d", endDate: "2024-02-29" }).success).toBe(true);
  expect(metricsFilterSchema.safeParse({ range: "7d", endDate: "2026-02-30" }).success).toBe(false);
  expect(metricsFilterSchema.safeParse({ range: "7d", endDate: "2026-10-10", periodId: "7e0f7447-bc5b-4daa-9fc7-77def961ff74" }).success).toBe(false);
  expect(metricsFilterSchema.safeParse({ range: "30d", startDate: "2026-10-01", endDate: "2026-10-10" }).success).toBe(true);
  expect(metricsFilterSchema.safeParse({ range: "30d", startDate: "2026-10-11", endDate: "2026-10-10" }).success).toBe(false);
  expect(metricsFilterSchema.safeParse({ range: "30d", startDate: "2026-02-30", endDate: "2026-10-10" }).success).toBe(false);
  expect(metricsFilterSchema.safeParse({ range: "30d", startDate: "2026-10-01" }).success).toBe(false);
});
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
