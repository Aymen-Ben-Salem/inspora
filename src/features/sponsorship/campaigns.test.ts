import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPreparationService,
  type PreparationStore,
  type PreparationTransaction,
} from "./campaigns";
import type {
  CampaignInput,
  SponsorPreparation,
  VerifiedSponsorAsset,
} from "./types";

function fixture() {
  let userId: string | null = "owner-a";
  let now = new Date("2026-10-09T12:00:00Z");
  const preparations = new Map<string, SponsorPreparation>();
  const assets = new Map<
    string,
    { owner: string; asset: VerifiedSponsorAsset; expiresAt: Date }
  >();
  const tx: PreparationTransaction = {
    lockOwner: async () => {},
    findPreparation: async (owner) => preparations.get(owner) ?? null,
    createPreparation: async (owner, expiresAt) => {
      const preparation: SponsorPreparation = {
        id: randomUUID(),
        ownerUserId: owner,
        state: "preparing",
        expiresAt,
        revision: 0,
        campaign: null,
      };
      preparations.set(owner, preparation);
      return preparation;
    },
    expirePreparation: async (p) => {
      p.state = "expired";
    },
    findOwnedAsset: async (owner, id, checkoutId, clock) => {
      const item = assets.get(id);
      return item?.owner === owner &&
        item.expiresAt > clock &&
        preparations.get(owner)?.id === checkoutId
        ? item.asset
        : null;
    },
    freezeCampaign: async (p, creative) => {
      const campaign = {
        id: p.campaign?.id ?? randomUUID(),
        checkoutId: p.id,
        versionId: randomUUID(),
        revision: p.revision + 1,
        state: "prepared" as const,
        expiresAt: p.expiresAt.toISOString(),
        creative: structuredClone(creative),
      };
      p.revision++;
      p.campaign = campaign;
      p.state = "ready";
      return campaign;
    },
  };
  const store: PreparationStore = { transaction: async (work) => work(tx) };
  const service = createPreparationService({
    owner: async () => userId,
    now: () => now,
    store,
  });
  const iconId = randomUUID(),
    wordmarkId = randomUUID();
  for (const [id, kind] of [
    [iconId, "icon"],
    [wordmarkId, "wordmark"],
  ] as const)
    assets.set(id, {
      owner: "owner-a",
      expiresAt: new Date("2026-10-10T12:00:00Z"),
      asset: {
        id,
        kind,
        contentType: "image/png",
        sizeBytes: 500,
        width: 64,
        height: 64,
        digest: "a".repeat(64),
        url: `/api/sponsorship/assets/${id}`,
      },
    });
  const input: CampaignInput = {
    title: "Example",
    url: "https://example.com",
    tagline: "For designers",
    feedDescription: "A workspace for your next great idea.",
    iconId,
    wordmarkId,
    expectedRevision: 0,
    variantIds: [],
  };
  return {
    service,
    preparations,
    assets,
    input,
    asOwner: (owner: string | null) => {
      userId = owner;
    },
    advance: () => {
      now = new Date("2026-10-10T12:00:00Z");
    },
  };
}
describe("owned unpaid sponsor preparation", () => {
  it.each([undefined, "", "   "])("requires a nonblank short feed description (%s)", async (feedDescription) => {
    const f = fixture();
    await f.service.begin();
    expect(await f.service.save({ ...f.input, feedDescription })).toEqual({
      ok: false,
      code: "invalid_input",
      message: "Short feed description is required.",
    });
    expect(f.preparations.get("owner-a")?.campaign).toBeNull();
  });
  it("limits the short feed description and freezes trimmed text independently of the legacy tagline", async () => {
    const f = fixture();
    await f.service.begin();
    expect(await f.service.save({ ...f.input, feedDescription: "a".repeat(301) })).toMatchObject({
      ok: false, code: "invalid_input",
    });
    expect(await f.service.save({ ...f.input, feedDescription: "  Made for focused work.  " })).toMatchObject({
      ok: true,
      value: { creative: { feedDescription: "Made for focused work.", tagline: f.input.tagline } },
    });
  });
  it.each([
    ["iconId", "Upload a compact icon before saving."],
    ["wordmarkId", "Upload a full wordmark before saving."],
  ])("explains a missing %s after a partial website import", async (field, message) => {
    const f = fixture();
    await f.service.begin();
    expect(await f.service.save({ ...f.input, [field]: "" })).toEqual({
      ok: false,
      code: "invalid_input",
      message,
    });
  });
  it("rejects a foreign brand asset and expired preparations without altering a saved version", async () => {
    const f = fixture();
    await f.service.begin();
    const saved = await f.service.save(f.input);
    f.asOwner("owner-b");
    await f.service.begin();
    expect(await f.service.save(f.input)).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    f.asOwner("owner-a");
    f.advance();
    expect(
      await f.service.save({ ...f.input, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, code: "expired" });
    expect(f.preparations.get("owner-a")?.campaign).toEqual(
      saved.ok ? saved.value : null,
    );
  });
  it("denies signed-out save, stale revisions and non-web destinations", async () => {
    const f = fixture();
    await f.service.begin();
    await f.service.save(f.input);
    expect(await f.service.save(f.input)).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(
      await f.service.save({ ...f.input, url: "javascript:alert(1)" }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    f.asOwner(null);
    expect(await f.service.begin()).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
  });
  it("saves one 24-hour preparation with a complete frozen creative and no paid entitlement", async () => {
    const f = fixture();
    const first = await f.service.begin();
    expect(first).toMatchObject({
      ok: true,
      value: {
        revision: 0,
        state: "preparing",
        expiresAt: new Date("2026-10-10T12:00:00Z"),
      },
    });
    expect(await f.service.begin()).toEqual(first);
    expect(await f.service.save(f.input)).toMatchObject({
      ok: true,
      value: {
        state: "prepared",
        revision: 1,
        creative: {
          title: "Example",
          assets: [{ id: f.input.iconId }, { id: f.input.wordmarkId }],
        },
      },
    });
    expect(f.preparations.size).toBe(1);
  });
  it("freezes and retains the verified original associated with a creative asset", async () => {
    const f = fixture();
    await f.service.begin();
    const icon = f.assets.get(f.input.iconId)!;
    const sourceId = randomUUID();
    icon.asset.sourceAssetId = sourceId;
    f.assets.set(sourceId, {
      ...icon,
      asset: {
        ...icon.asset,
        id: sourceId,
        kind: "original",
        sourceAssetId: undefined,
      },
    });
    const saved = await f.service.save(f.input);
    expect(saved.ok && saved.value.creative.assets.map((a) => a.id)).toContain(
      sourceId,
    );
  });
  it.each(["foreign", "expired"])(
    "rejects a creative referencing an %s original",
    async (caseName) => {
      const f = fixture();
      await f.service.begin();
      const icon = f.assets.get(f.input.iconId)!;
      const sourceId = randomUUID();
      icon.asset.sourceAssetId = sourceId;
      f.assets.set(sourceId, {
        ...icon,
        owner: caseName === "foreign" ? "owner-b" : icon.owner,
        expiresAt:
          caseName === "expired" ? new Date("2020-01-01") : icon.expiresAt,
        asset: {
          ...icon.asset,
          id: sourceId,
          kind: "original",
          sourceAssetId: undefined,
        },
      });
      expect(await f.service.save(f.input)).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    },
  );
});
