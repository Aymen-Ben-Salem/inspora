import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/auth/config", () => ({ isClerkConfigured: () => true }));
const fixtures = vi.hoisted(() => ({
  owner: "",
  objects: new Map<string, { bytes: Uint8Array; contentType: string }>(),
  deleted: [] as string[],
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: fixtures.owner }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddress: {
          verification: { status: "verified" },
          emailAddress: "sponsor-fixture@example.invalid",
        },
      }),
    },
  }),
}));
vi.mock("@/storage/private-sponsor-assets", async (original) => {
  const actual =
    await original<typeof import("@/storage/private-sponsor-assets")>();
  return {
    ...actual,
    privateSponsorStorage: () =>
      actual.createPrivateSponsorStorage({
        bucket: "fixture",
        randomUUID,
        get: async ({ key }) => fixtures.objects.get(key) ?? null,
        putImmutable: async ({ key, bytes, contentType }) => {
          fixtures.objects.set(key, { bytes, contentType });
        },
        delete: async ({ key }) => {
          fixtures.deleted.push(key);
          fixtures.objects.delete(key);
        },
        signPut: async () => "fixture-signed-upload",
      }),
  };
});
import sharp from "sharp";
import { withWriteTransaction } from "@/db/write-client";
import {
  creators,
  creatorUsernameAliases,
  profileAccounts,
  sponsorAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import {
  bindSponsorIdentity,
  preparationStore,
  withSponsorWrite,
} from "./repository";
import { readAccountCapabilities } from "./authorization";
import { ensureCreatorForOwner } from "@/features/creators/identity";
import { createPreparationService } from "./campaigns";
import {
  beginSponsorUpload,
  completeSponsorUpload,
  readOwnSponsorAsset,
} from "./media";
import { cleanupExpiredSponsorPreparations } from "./cleanup";
const owners = [
  "sponsor-rehearsal-a-" + randomUUID(),
  "sponsor-rehearsal-b-" + randomUUID(),
];
let clock = new Date();
const service = createPreparationService({
  owner: async () => fixtures.owner,
  now: () => clock,
  store: preparationStore,
});
let iconId: string, wordmarkId: string;
beforeAll(async () => {
  for (const owner of owners) await bindSponsorIdentity(owner);
  await withSponsorWrite((tx) =>
    tx.insert(sponsorCheckouts).values(
      Array.from({ length: 25 }, () => ({
        ownerUserId: owners[0],
        state: "expired",
        expiresAt: new Date("2020-01-01"),
        createdAt: new Date("2020-01-01"),
      })),
    ),
  );
  fixtures.owner = owners[0];
});
beforeEach(() => {
  fixtures.owner = owners[0];
});
afterAll(async () => {
  await withSponsorWrite(async (tx) => {
    const profiles = await tx
      .select({ id: creators.id })
      .from(creators)
      .where(inArray(creators.ownerUserId, owners));
    if (profiles.length)
      await tx.delete(creatorUsernameAliases).where(
        inArray(
          creatorUsernameAliases.creatorId,
          profiles.map((p) => p.id),
        ),
      );
    await tx.delete(creators).where(inArray(creators.ownerUserId, owners));
    await tx
      .delete(profileAccounts)
      .where(inArray(profileAccounts.userId, owners));
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
});
describe("ticket 01 on guarded disposable preview database", () => {
  it("preserves ordinary bootstrap and an existing creator with both capabilities", async () => {
    const ordinary = "sponsor-rehearsal-ordinary-" + randomUUID();
    owners.push(ordinary);
    fixtures.owner = ordinary;
    expect((await readAccountCapabilities(ordinary)).viewer).toBe(true);
    const created = await ensureCreatorForOwner({ userId: ordinary });
    expect(created.id).toBeTruthy();
    await bindSponsorIdentity(ordinary);
    expect(await readAccountCapabilities(ordinary)).toEqual({
      viewer: true,
      sponsor: true,
      sponsorReadonly: false,
    });
    expect((await ensureCreatorForOwner({ userId: ordinary })).id).toBe(
      created.id,
    );
  });
  it("enforces non-null verification fields at the database boundary", async () => {
    fixtures.owner = owners[1];
    const p = await service.begin();
    if (!p.ok) throw new Error("Fixture preparation missing");
    for (const missing of [
      { digest: null, width: 64, height: 32 },
      { digest: "a".repeat(64), width: null, height: null },
    ]) {
      await expect(
        withSponsorWrite((tx) =>
          tx.insert(sponsorAssets).values({
            ownerUserId: owners[1],
            checkoutId: p.value.id,
            kind: "icon",
            state: "verified",
            contentType: "image/png",
            sizeBytes: 100,
            stagingKey: randomUUID(),
            objectKey: "fixture",
            expiresAt: new Date(Date.now() + 86400000),
            ...missing,
          }),
        ),
      ).rejects.toThrow();
    }
    fixtures.owner = owners[0];
  });
  it("preserves legacy rows and four empty structural seats", async () => {
    await withSponsorWrite(async (tx) => {
      const legacy = await tx
        .select()
        .from(sponsors)
        .where(eq(sponsors.title, "Legacy rehearsal fixture"));
      expect(legacy[0]).toMatchObject({
        isActive: true,
        ownerUserId: null,
        accountId: null,
        campaignState: "legacy",
      });
      expect(await tx.select().from(sponsorSeats)).toHaveLength(4);
    });
    await expect(
      withSponsorWrite((tx) => tx.insert(sponsorSeats).values({ slot: 5 })),
    ).rejects.toThrow();
  });
  it("binds sponsor-only access and blocks creator bootstrap even with the feature off", async () => {
    expect(await readAccountCapabilities(owners[0])).toEqual({
      viewer: false,
      sponsor: true,
      sponsorReadonly: false,
    });
    await expect(ensureCreatorForOwner({ userId: owners[0] })).rejects.toThrow(
      "sponsor access only",
    );
    vi.stubEnv("SPONSORSHIP_ENABLED", "false");
    try {
      await expect(
        ensureCreatorForOwner({ userId: owners[0] }),
      ).rejects.toThrow("sponsor access only");
    } finally {
      vi.stubEnv("SPONSORSHIP_ENABLED", "true");
    }
    await withSponsorWrite(async (tx) => {
      expect(
        await tx
          .select()
          .from(profileAccounts)
          .where(inArray(profileAccounts.userId, owners.slice(0, 2))),
      ).toEqual([]);
      expect(
        await tx
          .select()
          .from(creators)
          .where(inArray(creators.ownerUserId, owners.slice(0, 2))),
      ).toEqual([]);
      expect(
        await tx
          .select()
          .from(sponsorAccounts)
          .where(inArray(sponsorAccounts.ownerUserId, owners)),
      ).toEqual([]);
    });
  });
  it("prepares and verifies private assets, rejects foreign completion and saves a frozen snapshot", async () => {
    const p = await service.begin();
    expect(p.ok).toBe(true);
    const bytes = await sharp({
      create: { width: 64, height: 32, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const ids: string[] = [];
    const sourceBytes = await sharp({
      create: { width: 3200, height: 1600, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const sourceTicket = await beginSponsorUpload({
      kind: "original",
      contentType: "image/png",
      sizeBytes: sourceBytes.length,
    });
    await expect(
      beginSponsorUpload({
        kind: "icon",
        contentType: "image/png",
        sizeBytes: bytes.length,
        sourceAssetId: sourceTicket.id,
      }),
    ).rejects.toThrow("verified original");
    await withSponsorWrite(async (tx) => {
      const [row] = await tx
        .select()
        .from(sponsorAssets)
        .where(eq(sponsorAssets.id, sourceTicket.id));
      fixtures.objects.set(row.stagingKey, {
        bytes: sourceBytes,
        contentType: "image/png",
      });
    });
    const original = await completeSponsorUpload(sourceTicket.id);
    expect(original).toMatchObject({
      kind: "original",
      width: 3200,
      height: 1600,
      digest: createHash("sha256").update(sourceBytes).digest("hex"),
    });
    expect((await readOwnSponsorAsset(original.id))?.bytes).toEqual(
      sourceBytes,
    );
    fixtures.owner = owners[1];
    await service.begin();
    await expect(
      beginSponsorUpload({
        kind: "icon",
        contentType: "image/png",
        sizeBytes: bytes.length,
        sourceAssetId: original.id,
      }),
    ).rejects.toThrow("verified original");
    fixtures.owner = owners[0];
    for (const kind of ["icon", "wordmark"] as const) {
      const ticket = await beginSponsorUpload({
        kind,
        contentType: "image/png",
        sizeBytes: bytes.length,
        sourceAssetId: original.id,
      });
      await withSponsorWrite(async (tx) => {
        const [row] = await tx
          .select()
          .from(sponsorAssets)
          .where(eq(sponsorAssets.id, ticket.id));
        fixtures.objects.set(row.stagingKey, {
          bytes,
          contentType: "image/png",
        });
      });
      fixtures.owner = owners[1];
      await service.begin();
      await expect(completeSponsorUpload(ticket.id)).rejects.toThrow(
        "unavailable",
      );
      fixtures.owner = owners[0];
      expect(await completeSponsorUpload(ticket.id)).toMatchObject({
        width: 64,
        height: 32,
        contentType: "image/png",
        sourceAssetId: original.id,
      });
      ids.push(ticket.id);
    }
    [iconId, wordmarkId] = ids;
    const result = await service.save({
      title: "Fixture creative",
      url: "https://example.com",
      iconId,
      wordmarkId,
      expectedRevision: 0,
      variantIds: [],
    });
    expect(result).toMatchObject({
      ok: true,
      value: { revision: 1, state: "prepared" },
    });
    expect(
      result.ok &&
        result.value.creative.assets.filter((a) => a.id === original.id),
    ).toEqual([original]);
    fixtures.owner = owners[1];
    expect(
      await service.save({
        title: "Foreign",
        url: "https://example.com",
        iconId,
        wordmarkId,
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    fixtures.owner = owners[0];
  });
  it("rejects legacy writer changes, mutable snapshots and stale concurrent saves", async () => {
    const read = await service.read();
    if (!read.ok || !read.value.campaign)
      throw new Error("Fixture campaign missing");
    const c = read.value.campaign;
    await expect(
      withWriteTransaction((tx) =>
        tx
          .update(sponsors)
          .set({ title: "Old code" })
          .where(eq(sponsors.id, c.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withWriteTransaction((tx) =>
        tx.delete(sponsors).where(eq(sponsors.id, c.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withSponsorWrite((tx) =>
        tx
          .update(sponsorCampaignVersions)
          .set({ revision: 99 })
          .where(eq(sponsorCampaignVersions.id, c.versionId)),
      ),
    ).rejects.toThrow();
    const result = await Promise.all([
      service.save({
        title: "Concurrent A",
        url: "https://example.com",
        iconId,
        wordmarkId,
        expectedRevision: 1,
      }),
      service.save({
        title: "Concurrent B",
        url: "https://example.com",
        iconId,
        wordmarkId,
        expectedRevision: 1,
      }),
    ]);
    expect(result.filter((r) => r.ok)).toHaveLength(1);
    expect(result.filter((r) => !r.ok)).toMatchObject([
      { ok: false, code: "conflict" },
    ]);
    await expect(
      withSponsorWrite(async (tx) => {
        await tx.execute(sql`select 1`);
        await tx
          .update(sponsors)
          .set({ title: "Rollback" })
          .where(eq(sponsors.id, c.id));
        throw new Error("Forced rollback");
      }),
    ).rejects.toThrow("Forced rollback");
    const after = await service.read();
    expect(after.ok && after.value.campaign?.creative.title).not.toBe(
      "Rollback",
    );
  });
  it("expires preparation and cleans private assets without creating a seat or creator", async () => {
    clock = new Date(Date.now() + 86400001);
    expect(
      await service.save({
        title: "Expired",
        url: "https://example.com",
        iconId,
        wordmarkId,
        expectedRevision: 2,
      }),
    ).toMatchObject({ ok: false, code: "expired" });
    expect(await cleanupExpiredSponsorPreparations(clock)).toMatchObject({
      removed: 3,
    });
    await expect(readOwnSponsorAsset(iconId)).rejects.toThrow("expired");
    expect(fixtures.objects.size).toBe(0);
    await withSponsorWrite(async (tx) => {
      expect(
        await tx
          .select()
          .from(sponsorSeats)
          .where(eq(sponsorSeats.state, "free")),
      ).toHaveLength(4);
      expect(
        await tx
          .select()
          .from(sponsorAssets)
          .where(inArray(sponsorAssets.ownerUserId, owners)),
      ).toHaveLength(0);
    });
  });
  it("denies preparation and uploads for a former read-only account", async () => {
    fixtures.owner = owners[1];
    await withSponsorWrite((tx) =>
      tx
        .insert(sponsorAccounts)
        .values({ ownerUserId: owners[1], state: "inactive" }),
    );
    await expect(service.begin()).rejects.toThrow("unavailable");
    await expect(
      beginSponsorUpload({
        kind: "icon",
        contentType: "image/png",
        sizeBytes: 100,
      }),
    ).rejects.toThrow();
    fixtures.owner = owners[0];
  });
});
