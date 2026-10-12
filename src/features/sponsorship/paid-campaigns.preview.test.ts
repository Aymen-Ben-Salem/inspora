import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
const access = vi.hoisted(() => ({ owner: null as string | null }));
vi.mock("./authorization", () => ({
  verifiedSponsorOwner: async () => access.owner,
}));
vi.mock("@/storage/private-sponsor-assets", () => ({
  privateSponsorStorage: () => ({
    sign: async () => ({
      uploadUrl: "https://private.example.invalid",
      method: "PUT",
      headers: {},
    }),
    read: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    }),
    delete: async () => {},
  }),
  createSponsorStagingKey: (owner: string, id: string) =>
    `sponsorships/${owner}/${id}/staging/asset.png`,
}));
import {
  sponsorAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorDeliveryIntervals,
  sponsorDeliveryPeriods,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import { withSponsorWrite } from "./repository";
import { createPaidCampaignService } from "./paid-campaigns";
import type { CampaignInput } from "./types";
import { getActiveSponsors } from "@/data/sponsor-repository";
import { beginSponsorUpload, readOwnSponsorAsset } from "./media";
import { cleanupExpiredSponsorPreparations } from "./cleanup";
import { metadataFetcher } from "./metadata";
import { POST as suggestFromWebsite } from "@/app/api/sponsorship/metadata/route";
const owners: string[] = [];
const suggestionRequest = () =>
  new Request("https://preview.example/api/sponsorship/metadata", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://preview.example",
    },
    body: JSON.stringify({ url: "https://another.example.com" }),
  });
afterEach(async () => {
  await withSponsorWrite(async (tx) => {
    const accounts = await tx
      .select()
      .from(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    for (const a of accounts)
      await tx
        .update(sponsorSeats)
        .set({
          state: "free",
          accountId: null,
          checkoutId: null,
          reservedUntil: null,
        })
        .where(eq(sponsorSeats.accountId, a.id));
    for (const account of accounts) {
      await tx.delete(sponsorDeliveryIntervals).where(eq(sponsorDeliveryIntervals.accountId, account.id));
      await tx.delete(sponsorDeliveryPeriods).where(eq(sponsorDeliveryPeriods.accountId, account.id));
    }
    await tx
      .delete(sponsorVersionAssets)
      .where(inArray(sponsorVersionAssets.ownerUserId, owners));
    await tx
      .delete(sponsorCampaignVersions)
      .where(inArray(sponsorCampaignVersions.ownerUserId, owners));
    await tx
      .delete(sponsorAssets)
      .where(inArray(sponsorAssets.ownerUserId, owners));
    await tx
      .delete(sponsorCheckouts)
      .where(inArray(sponsorCheckouts.ownerUserId, owners));
    await tx.delete(sponsors).where(inArray(sponsors.ownerUserId, owners));
    await tx
      .delete(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    await tx
      .delete(sponsorIdentities)
      .where(inArray(sponsorIdentities.userId, owners));
  });
  owners.length = 0;
  access.owner = null;
  vi.restoreAllMocks();
});
it("suggests website fields for a paid sponsor with no unpaid preparation without changing the completed checkout", async () => {
  const f = await fixture({ checkoutExpiresAt: new Date(Date.now() + 86400000) });
  access.owner = f.owner;
  const before = await withSponsorWrite((tx) =>
    tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, f.ids.checkout)),
  );
  const website = vi.spyOn(metadataFetcher, "suggest").mockResolvedValue({
    title: "Another product",
    imageUrl: undefined,
    iconUrl: undefined,
    wordmarkUrl: undefined,
  });
  try {
    const response = await suggestFromWebsite(suggestionRequest());
    const body = await response.json();
    expect(body, body.message).toMatchObject({
      ok: true,
      value: { title: "Another product" },
    });
    const after = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.ownerUserId, f.owner)),
    );
    expect(after).toEqual(before);
    expect(await f.service.list()).toMatchObject({
      ok: true,
      value: { campaigns: [] },
    });
  } finally {
    website.mockRestore();
    access.owner = null;
  }
});
it("keeps website suggestions available for an owned unpaid preparation", async () => {
  const owner = `ticket03-${randomUUID()}`;
  owners.push(owner);
  await withSponsorWrite(async (tx) => {
    await tx.insert(sponsorIdentities).values({ userId: owner });
    await tx.insert(sponsorCheckouts).values({
      ownerUserId: owner,
      state: "preparing",
      expiresAt: new Date(Date.now() + 86400000),
    });
  });
  access.owner = owner;
  vi.spyOn(metadataFetcher, "suggest").mockResolvedValue({
    title: "Before checkout",
    imageUrl: undefined,
    iconUrl: undefined,
    wordmarkUrl: undefined,
  });
  expect(
    await (await suggestFromWebsite(suggestionRequest())).json(),
  ).toMatchObject({
    ok: true,
    value: { title: "Before checkout" },
  });
});
it.each(["inactive", "revoked"] as const)(
  "denies website suggestions for an %s account before reading the website",
  async (state) => {
    const f = await fixture();
    await withSponsorWrite((tx) =>
      tx
        .update(sponsorAccounts)
        .set({ state })
        .where(eq(sponsorAccounts.id, f.ids.account)),
    );
    access.owner = f.owner;
    const website = vi.spyOn(metadataFetcher, "suggest");
    const response = await suggestFromWebsite(suggestionRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(website).not.toHaveBeenCalled();
  },
);
it("accepts paid uploads independently of an expired checkout and keeps owned referenced media readable after expiry", async () => {
  const f = await fixture();
  access.owner = f.owner;
  const saved = await f.service.save(null, f.input);
  expect(saved.ok).toBe(true);
  await withSponsorWrite((tx) =>
    tx
      .update(sponsorAssets)
      .set({ expiresAt: new Date(0) })
      .where(eq(sponsorAssets.ownerUserId, f.owner)),
  );
  expect(await readOwnSponsorAsset(f.ids.iconId)).toMatchObject({
    contentType: "image/png",
  });
  const uploaded = await beginSponsorUpload({
    kind: "icon",
    contentType: "image/png",
    sizeBytes: 80,
  });
  expect(uploaded).toMatchObject({
    id: expect.any(String),
    uploadUrl: "https://private.example.invalid",
  });
  await withSponsorWrite((tx) =>
    tx
      .update(sponsorAssets)
      .set({ expiresAt: new Date(0) })
      .where(eq(sponsorAssets.id, uploaded.id)),
  );
  expect(await cleanupExpiredSponsorPreparations()).toMatchObject({
    removed: 1,
  });
  expect(await readOwnSponsorAsset(f.ids.iconId)).toMatchObject({
    contentType: "image/png",
  });
  const b = await fixture();
  access.owner = b.owner;
  expect(await readOwnSponsorAsset(f.ids.iconId)).toBeNull();
  access.owner = null;
});
async function fixture(options: { checkoutExpiresAt?: Date } = {}) {
  const owner = `ticket03-${randomUUID()}`;
  owners.push(owner);
  const ids = await withSponsorWrite(async (tx) => {
    await tx.insert(sponsorIdentities).values({ userId: owner });
    const [a] = await tx
      .insert(sponsorAccounts)
      .values({
        ownerUserId: owner,
        state: "active",
        paidThrough: new Date(Date.now() + 86400000),
      })
      .returning();
    const [p] = await tx
      .insert(sponsorCheckouts)
      .values({
        ownerUserId: owner,
        state: "completed",
        expiresAt: options.checkoutExpiresAt ?? new Date(0),
      })
      .returning();
    const [seat] = await tx
      .select()
      .from(sponsorSeats)
      .where(eq(sponsorSeats.state, "free"))
      .limit(1)
      .for("update");
    await tx
      .update(sponsorSeats)
      .set({ state: "occupied", accountId: a.id, checkoutId: p.id })
      .where(eq(sponsorSeats.slot, seat.slot));
    const assets = await tx
      .insert(sponsorAssets)
      .values(
        (["icon", "wordmark"] as const).map((kind) => ({
          ownerUserId: owner,
          checkoutId: p.id,
          kind,
          state: "verified",
          contentType: "image/png",
          sizeBytes: 50,
          stagingKey: `${owner}/${kind}`,
          objectKey: `${owner}/${kind}/frozen`,
          digest: "a".repeat(64),
          width: 64,
          height: 64,
          expiresAt: new Date(Date.now() + 86400000),
        })),
      )
      .returning();
    return {
      account: a.id,
      checkout: p.id,
      iconId: assets[0].id,
      wordmarkId: assets[1].id,
    };
  });
  let currentOwner: string | null = owner;
  let failPromotion = false;
  const promote = vi.fn(
    async ({
      creative,
    }: {
      creative: { assets: { id: string; kind: string }[] };
    }) => {
      if (failPromotion) throw new Error("storage unavailable");
      return creative.assets
        .filter((a) => a.kind !== "original")
        .map((a) => ({
          id: a.id,
          key: `public/${a.id}`,
          url: `https://media.example.invalid/${a.id}`,
        }));
    },
  );
  const service = createPaidCampaignService({
    owner: async () => currentOwner,
    now: () => new Date(),
    promote,
  });
  const input: CampaignInput = {
    title: "First",
    url: "https://first.example.com",
    tagline: "",
    expectedRevision: 0,
    iconId: ids.iconId,
    wordmarkId: ids.wordmarkId,
    variantIds: [],
  };
  return {
    owner,
    ids,
    input,
    service,
    promote,
    asOwner: (v: string | null) => {
      currentOwner = v;
    },
    fail: () => {
      failPromotion = true;
    },
  };
}
it("creates multiple private drafts and denies foreign campaigns/assets before promotion", async () => {
  const a = await fixture(),
    b = await fixture();
  const first = await a.service.save(null, a.input);
  expect(first).toMatchObject({
    ok: true,
    value: { state: "draft", revision: 1 },
  });
  expect(
    await a.service.save(null, { ...a.input, title: "Second" }),
  ).toMatchObject({ ok: true });
  expect(await a.service.list()).toMatchObject({
    ok: true,
    value: { campaigns: [{}, {}] },
  });
  if (!first.ok) throw new Error("draft missing");
  expect(
    await b.service.save(first.value.id, { ...b.input, expectedRevision: 1 }),
  ).toMatchObject({ ok: false, code: "forbidden" });
  expect(await b.service.publish(first.value.id, 1)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  expect(await b.service.remove(first.value.id, 1)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  expect(await b.service.save(null, a.input)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  expect(b.promote).not.toHaveBeenCalled();
});
it("makes stale draft/public editors conflict after a campaign switch and admits only one concurrent edit", async () => {
  const f = await fixture();
  const first = await f.service.save(null, f.input),
    second = await f.service.save(null, { ...f.input, title: "Second" });
  if (!first.ok || !second.ok) throw Error("draft missing");
  const published = await f.service.publish(first.value.id, 1);
  if (!published.ok) throw Error("publication missing");
  expect(
    await f.service.save(first.value.id, { ...f.input, expectedRevision: 1 }),
  ).toMatchObject({ ok: false, code: "conflict" });
  await f.service.publish(second.value.id, 1);
  expect(
    await f.service.save(first.value.id, {
      ...f.input,
      expectedRevision: published.value.revision,
    }),
  ).toMatchObject({ ok: false, code: "conflict" });
  const latest = await f.service.read(second.value.id);
  if (!latest.ok) throw Error("campaign missing");
  const concurrent = await Promise.all(
    ["One", "Two"].map((title) =>
      f.service.save(second.value.id, {
        ...f.input,
        title,
        expectedRevision: latest.value.revision,
      }),
    ),
  );
  expect(concurrent.filter((r) => r.ok)).toHaveLength(1);
  expect(concurrent.filter((r) => !r.ok)).toMatchObject([{ code: "conflict" }]);
});
it("atomically switches and edits all public fields, retaining history on stale, invalid or failed saves", async () => {
  const f = await fixture();
  const replacements = await withSponsorWrite((tx) =>
    tx
      .insert(sponsorAssets)
      .values(
        (["icon", "wordmark", "media", "poster", "video-preview"] as const).map(
          (kind) => ({
            ownerUserId: f.owner,
            checkoutId: f.ids.checkout,
            kind,
            state: "verified",
            contentType: ["media", "video-preview"].includes(kind)
              ? "video/mp4"
              : "image/png",
            sizeBytes: 50,
            stagingKey: `${f.owner}/replacement/${kind}`,
            objectKey: `${f.owner}/replacement/${kind}/frozen`,
            digest: "b".repeat(64),
            width: 160,
            height: 90,
            expiresAt: new Date(Date.now() + 86400000),
          }),
        ),
      )
      .returning(),
  );
  const asset = (kind: string) => replacements.find((a) => a.kind === kind)!.id;
  const input = {
    ...f.input,
    title: "Second",
    url: "https://second.example.com",
    iconId: asset("icon"),
    wordmarkId: asset("wordmark"),
    mediaId: asset("media"),
    posterId: asset("poster"),
    videoPreviewId: asset("video-preview"),
  };
  const a = await f.service.save(null, f.input),
    b = await f.service.save(null, input);
  if (!a.ok || !b.ok) throw Error("draft missing");
  expect(await f.service.publish(a.value.id, 1)).toMatchObject({ ok: true });
  expect(await f.service.publish(b.value.id, 1)).toMatchObject({ ok: true });
  expect(
    (await getActiveSponsors()).filter((s) =>
      [a.value.id, b.value.id].includes(s.id),
    ),
  ).toMatchObject([
    {
      id: b.value.id,
      title: "Second",
      url: "https://second.example.com",
      iconUrl: expect.stringContaining(asset("icon")),
      wordmarkUrl: expect.stringContaining(asset("wordmark")),
      mediaUrl: expect.stringContaining(asset("media")),
      mediaPosterUrl: expect.stringContaining(asset("poster")),
      mediaVideoPreview: {
        url: expect.stringContaining(asset("video-preview")),
      },
    },
  ]);
  const edited = await f.service.save(b.value.id, {
    ...f.input,
    title: "Edited",
    url: "https://edited.example.com",
    expectedRevision: 2,
  });
  expect(edited).toMatchObject({
    ok: true,
    value: { revision: 3, state: "published" },
  });
  expect(
    await f.service.save(b.value.id, { ...f.input, expectedRevision: 1 }),
  ).toMatchObject({ ok: false, code: "conflict" });
  expect(
    await f.service.save(b.value.id, {
      ...f.input,
      url: "javascript:bad",
      expectedRevision: 3,
    }),
  ).toMatchObject({ ok: false, code: "invalid_input" });
  f.fail();
  await expect(
    f.service.save(b.value.id, {
      ...f.input,
      title: "Failed",
      expectedRevision: 3,
    }),
  ).rejects.toThrow("storage unavailable");
  expect(await f.service.read(b.value.id)).toEqual(edited);
  const history = await withSponsorWrite((tx) =>
    tx
      .select()
      .from(sponsorCampaignVersions)
      .where(eq(sponsorCampaignVersions.campaignId, b.value.id)),
  );
  expect(history.map((v) => v.creative.title)).toEqual([
    "Second",
    "Second",
    "Edited",
  ]);
  expect(await f.service.remove(b.value.id, 3)).toMatchObject({
    ok: false,
    code: "conflict",
  });
  expect(await f.service.remove(a.value.id, 3)).toMatchObject({ ok: true });
  expect(await f.service.read(a.value.id)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
});
it("keeps inactive history read-only, denies revoked identities and retains the completed billing snapshot", async () => {
  const f = await fixture();
  const before = await withSponsorWrite((tx) =>
    tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, f.ids.checkout)),
  );
  const saved = await f.service.save(null, f.input);
  if (!saved.ok) throw Error("draft missing");
  await withSponsorWrite(async (tx) => {
    await tx
      .update(sponsorAccounts)
      .set({ state: "inactive" })
      .where(eq(sponsorAccounts.id, f.ids.account));
    await tx
      .update(sponsorSeats)
      .set({ state: "free", accountId: null, checkoutId: null })
      .where(eq(sponsorSeats.accountId, f.ids.account));
  });
  expect(await f.service.list()).toMatchObject({
    ok: true,
    value: { readonly: true, campaigns: [{ id: saved.value.id }] },
  });
  expect(
    await f.service.save(saved.value.id, { ...f.input, expectedRevision: 1 }),
  ).toMatchObject({ ok: false, code: "forbidden" });
  expect(await f.service.publish(saved.value.id, 1)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  expect(await f.service.remove(saved.value.id, 1)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  const after = await withSponsorWrite((tx) =>
    tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, f.ids.checkout)),
  );
  expect(after).toEqual(before);
  await withSponsorWrite((tx) =>
    tx
      .update(sponsorIdentities)
      .set({ state: "revoked" })
      .where(eq(sponsorIdentities.userId, f.owner)),
  );
  await expect(f.service.list()).rejects.toThrow(
    "Sponsor access is unavailable",
  );
  expect(f.promote).not.toHaveBeenCalled();
});
