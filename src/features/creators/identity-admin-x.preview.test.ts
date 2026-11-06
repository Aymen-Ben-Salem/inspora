import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: async () => ({ userId: "creator-x-guard-test" }) }));
vi.mock("./x-api", () => ({ lookupXProfile: external.lookup, XLookupError: class extends Error {} }));

import { adminAuditLogs, creators, creatorUsernameAliases } from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import { createAdminCreator, saveAdminCreatorForAttribution } from "./identity/admin";

const enabled = process.env.RUN_CREATOR_X_GUARD_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";

describe.skipIf(!enabled)("admin X duplicate guards in isolated Preview fixtures", () => {
  beforeEach(() => vi.clearAllMocks());

  function fixture() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const handle = "xg_" + suffix;
    const accountId = "x-guard-" + suffix;
    external.lookup.mockResolvedValue({ id: accountId, username: handle });
    return {
      suffix, handle, accountId, id: randomUUID(),
      existingUsername: "legacy_" + suffix,
      input: { name: "New duplicate", username: "new_" + suffix, xProfileUrl: "https://x.com/" + handle, avatarUrl: "/brand/default-avatar.svg" },
    };
  }

  // Most checks never commit: even a failed assertion rolls its fixtures back.
  async function rolledBack(work: (tx: WriteTx) => Promise<void>) {
    const rollback = new Error("Rollback creator X guard fixture");
    try {
      await withWriteTransaction(async (tx) => {
        await work(tx);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function insertLegacy(tx: WriteTx, f: ReturnType<typeof fixture>, overrides: Partial<typeof creators.$inferInsert> = {}) {
    await tx.insert(creators).values({
      id: f.id, name: "Existing creator", username: f.existingUsername,
      avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview", xProfileUrl: "https://x.com/" + f.handle,
      ...overrides,
    });
  }

  it.each([
    ["canonical X", (handle: string) => `https://x.com/${handle}`],
    ["legacy Twitter case/query", (handle: string) => ` HTTP://WWW.TWITTER.COM/${handle.toUpperCase()}/?s=21 `],
    ["legacy status URL", (handle: string) => `https://twitter.com/${handle}/status/123`],
    ["mobile X URL", (handle: string) => `https://mobile.x.com/${handle}#profile`],
    ["trailing host dot/default port", (handle: string) => `https://x.com.:443/${handle}/`],
  ])("blocks creation beside a URL-only creator: %s", async (_label, url) => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f, { xProfileUrl: url(f.handle) });
      await expect(saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input)).rejects.toMatchObject({
        code: "conflict", message: expect.stringContaining(`Existing creator (@${f.existingUsername})`),
      });
      expect(await tx.select().from(creators).where(eq(creators.username, f.input.username))).toHaveLength(0);
      const [legacy] = await tx.select().from(creators).where(eq(creators.id, f.id));
      expect(legacy).toMatchObject({ ownerUserId: null, xProfileAccountId: null, xProviderId: null });
    });
  }, 30_000);

  it("also catches legacy X in Website without modifying that record", async () => {
    const f = fixture();
    await rolledBack(async (tx) => {
      const url = "https://www.twitter.com/" + f.handle;
      await insertLegacy(tx, f, { xProfileUrl: null, url });
      await expect(saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input)).rejects.toMatchObject({ code: "conflict" });
      const [legacy] = await tx.select().from(creators).where(eq(creators.id, f.id));
      expect(legacy).toMatchObject({ url, xProfileUrl: null });
    });
  }, 30_000);

  it("points to Trash instead of recreating a trashed URL-only creator", async () => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f, { trashedAt: new Date() });
      await expect(saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input)).rejects.toMatchObject({
        code: "conflict", message: expect.stringContaining("Restore that creator from Trash"),
      });
    });
  }, 30_000);

  it("blocks assigning the same URL-only identity to a different existing creator", async () => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f);
      const otherId = randomUUID();
      await tx.insert(creators).values({ id: otherId, name: "Other creator", username: f.input.username, avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" });
      await expect(saveAdminCreatorForAttribution(tx, { userId: "admin" }, { ...f.input, id: otherId })).rejects.toMatchObject({ code: "conflict" });
      const [other] = await tx.select().from(creators).where(eq(creators.id, otherId));
      expect(other).toMatchObject({ name: "Other creator", xProfileUrl: null, xProfileAccountId: null });
    });
  }, 30_000);

  it.each(["xProfileAccountId", "xProviderId"] as const)("still catches permanent identity %s after a handle change", async (field) => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f, { xProfileUrl: "https://x.com/old_handle", [field]: f.accountId });
      await expect(saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input)).rejects.toMatchObject({ code: "conflict" });
    });
  }, 30_000);

  it("keeps a pinned different identity authoritative when a handle is reused", async () => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f, { xProfileAccountId: "former-" + f.accountId });
      const result = await saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input);
      expect(result.creatorId).not.toBe(f.id);
      const [created] = await tx.select().from(creators).where(eq(creators.id, result.creatorId));
      expect(created).toMatchObject({ xProfileAccountId: f.accountId, ownerUserId: null, xProviderId: null });
    });
  }, 30_000);

  it.each([
    (handle: string) => `https://x.com/${handle}_other`,
    (handle: string) => `https://x.com.example.org/${handle}`,
  ])("does not mistake a different URL for the same X profile (%#)", async (url) => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f, { xProfileUrl: url(f.handle) });
      const result = await saveAdminCreatorForAttribution(tx, { userId: "admin" }, f.input);
      expect(result.creatorId).not.toBe(f.id);
    });
  }, 30_000);

  it("allows reusing and editing the existing URL-only creator without changing ownership", async () => {
    const f = fixture();
    await rolledBack(async (tx) => {
      await insertLegacy(tx, f);
      const result = await saveAdminCreatorForAttribution(tx, { userId: "admin" }, { ...f.input, id: f.id, username: f.existingUsername });
      expect(result.creatorId).toBe(f.id);
      const [updated] = await tx.select().from(creators).where(eq(creators.id, f.id));
      expect(updated).toMatchObject({ xProfileAccountId: f.accountId, ownerUserId: null, xProviderId: null });
    });
  }, 30_000);

  it("allows only one of two simultaneous admin creations for the same X identity", async () => {
    const f = fixture();
    try {
      const outcomes = await Promise.allSettled([
        createAdminCreator(f.input),
        createAdminCreator({ ...f.input, username: "peer_" + f.suffix }),
      ]);
      expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const failed = outcomes.find(result => result.status === "rejected");
      expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "conflict", message: expect.stringContaining("Select that existing creator") });
    } finally {
      await withWriteTransaction(async (tx) => {
        const rows = await tx.select({ id: creators.id }).from(creators).where(and(eq(creators.xProfileAccountId, f.accountId), inArray(creators.username, [f.input.username, "peer_" + f.suffix])));
        const ids = rows.map(row => row.id);
        if (!ids.length) return;
        await tx.delete(adminAuditLogs).where(and(eq(adminAuditLogs.actorId, "creator-x-guard-test"), inArray(adminAuditLogs.resourceId, ids)));
        await tx.delete(creatorUsernameAliases).where(inArray(creatorUsernameAliases.creatorId, ids));
        await tx.delete(creators).where(inArray(creators.id, ids));
      });
    }
  }, 60_000);
});
