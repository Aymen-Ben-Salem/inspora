import { afterEach, describe, expect, it, vi } from "vitest";

const { list, writesEnabled } = vi.hoisted(() => ({
  list: vi.fn(),
  writesEnabled: vi.fn(() => true),
}));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ verifiedSponsorOwner: vi.fn() }));
vi.mock("./paid-campaigns", () => ({
  createPaidCampaignService: () => ({ list }),
}));
vi.mock("./public-media", () => ({ promoteSponsorMedia: vi.fn() }));
vi.mock("./config", () => ({ sponsorshipWritesEnabled: writesEnabled }));

import { paidCampaignService } from "./campaign-service";

describe("campaign history during recovery", () => {
  afterEach(() => { vi.resetAllMocks(); writesEnabled.mockReturnValue(true); });

  it("keeps paid campaign history available but read-only when writes are disabled", async () => {
    const campaigns = [{ id: "owned-campaign", revision: 4 }];
    list.mockResolvedValue({ ok: true, value: { ownerUserId: "owner", campaigns, readonly: false } });
    writesEnabled.mockReturnValue(false);
    const result = await paidCampaignService.list();
    expect(result).toEqual({ ok: true, value: { ownerUserId: "owner", campaigns, readonly: true } });
    if (result.ok) expect(result.value.campaigns).toBe(campaigns);
  });

  it("preserves the account's existing permissions when campaign writes are enabled", async () => {
    for (const readonly of [false, true]) {
      const result = { ok: true, value: { ownerUserId: "owner", campaigns: [], readonly } };
      list.mockResolvedValue(result);
      expect(await paidCampaignService.list()).toBe(result);
    }
  });

  it("preserves ownership denial while writes are disabled", async () => {
    const denied = { ok: false, code: "unauthenticated", message: "Sign in with your sponsor identity." };
    list.mockResolvedValue(denied);
    writesEnabled.mockReturnValue(false);
    expect(await paidCampaignService.list()).toBe(denied);
  });
});
