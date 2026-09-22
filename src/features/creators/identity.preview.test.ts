import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ getUser: vi.fn(), after: vi.fn(), rollbackNext: false }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: external.getUser } }) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: external.after }));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/write-client")>();
  return { ...actual, withWriteTransaction: <T>(work: (tx: import("@/db/write-client").WriteTx) => Promise<T>) => {
    const rollback = external.rollbackNext;
    external.rollbackNext = false;
    return actual.withWriteTransaction(async (tx) => {
      const result = await work(tx);
      if (rollback) throw new Error("Forced failure before commit");
      return result;
    });
  } };
});

import { creators, creatorUsernameAliases, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { revalidateTag } from "next/cache";
import { ensureCreatorForOwner, getCreatorSummary, resolvePublicCreatorProfile, updateOwnedCreatorProfile, updateOwnedCreatorAvatar } from "./identity";

const enabled = process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" &&
  ["development", "preview"].includes(process.env.DATA_ENVIRONMENT ?? "");

describe.skipIf(!enabled)("creator identity in isolated guarded nonproduction rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const ownerUserIds: string[] = [];
  const fixtureCreatorIds: string[] = [];
  const owner = () => {
    const userId = "identity-" + suffix + "-" + ownerUserIds.length;
    ownerUserIds.push(userId);
    return { userId };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    external.getUser.mockResolvedValue({ fullName: "Identity fixture", username: "fixture_" + suffix, imageUrl: "" });
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (ownerUserIds.length) await tx.delete(creators).where(inArray(creators.ownerUserId, ownerUserIds));
      if (fixtureCreatorIds.length) await tx.delete(creators).where(inArray(creators.id, fixtureCreatorIds));
      if (ownerUserIds.length) await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, ownerUserIds));
    });
  });

  it("reuses one owned creator and one reserved username across concurrent entry", async () => {
    const principal = owner();
    const profiles = await Promise.all(Array.from({ length: 4 }, () => ensureCreatorForOwner(principal)));
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(1);
    expect(await ensureCreatorForOwner(principal)).toEqual(profiles[0]);
    const profile = profiles[0]!;
    expect(await resolvePublicCreatorProfile(profile.username)).toEqual({ profile, canonicalUsername: profile.username, isAlias: false });
    await withWriteTransaction(async (tx) => {
      const aliases = await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.creatorId, profile.id));
      expect(aliases).toHaveLength(1);
      expect(aliases[0]).toMatchObject({ username: profile.username, isCurrent: true });
    });
    expect(external.after).toHaveBeenCalledTimes(1);
    expect(revalidateTag).not.toHaveBeenCalled();
    // The returned identity is committed and publicly visible before cache expiry is run.
    await external.after.mock.calls[0]![0]();
    expect(revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
  }, 60000);

  it("allocates distinct candidates when different owners race for the same username", async () => {
    external.getUser.mockResolvedValue({ fullName: "Collision fixture", username: "race_" + suffix, imageUrl: "" });
    const profiles = await Promise.all(Array.from({ length: 4 }, () => ensureCreatorForOwner(owner())));
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.username))).toEqual(new Set([
      "race_" + suffix, "race_" + suffix + "_2", "race_" + suffix + "_3", "race_" + suffix + "_4",
    ]));
    for (const profile of profiles) expect((await resolvePublicCreatorProfile(profile.username))?.profile.id).toBe(profile.id);
  }, 60000);

  it("skips both former aliases and current usernames without aliases while preserving normalization", async () => {
    const principal = owner();
    const legacyPrincipal = owner();
    const reservedId = randomUUID();
    const legacyId = randomUUID();
    fixtureCreatorIds.push(reservedId, legacyId);
    const base = "emy_" + suffix;
    external.getUser.mockResolvedValue({ fullName: "Émy", username: " @Émy " + suffix.toUpperCase() + " ", imageUrl: "" });
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId: legacyPrincipal.userId });
      await tx.insert(creators).values([
        { id: reservedId, name: "Former alias fixture", username: "other_" + suffix, avatarUrl: "/avatar.svg", recordOrigin: "preview" },
        { id: legacyId, ownerUserId: legacyPrincipal.userId, name: "Legacy current fixture", username: base + "_2", avatarUrl: "/avatar.svg", recordOrigin: "preview" },
      ]);
      await tx.insert(creatorUsernameAliases).values([
        { creatorId: reservedId, username: base, isCurrent: false },
        { creatorId: reservedId, username: "other_" + suffix, isCurrent: true },
      ]);
    });
    const profile = await ensureCreatorForOwner(principal);
    expect(profile.username).toBe(base + "_3");
    expect((await resolvePublicCreatorProfile(base))?.profile.id).toBe(reservedId);
    expect(await resolvePublicCreatorProfile(base + "_2")).toBeNull();
    expect((await resolvePublicCreatorProfile(profile.username))?.profile.id).toBe(profile.id);
    const edited = await updateOwnedCreatorProfile(legacyPrincipal.userId, { name: "Updated legacy fixture" });
    expect(edited.name).toBe("Updated legacy fixture");
    const avatar = await updateOwnedCreatorAvatar(legacyPrincipal.userId, { url: "/updated-avatar.svg", storageKey: "identity-test-avatar-" + suffix });
    expect(avatar.profile.avatarUrl).toBe("/updated-avatar.svg");
    expect(avatar.previousAsset).toBeNull();
    expect(await getCreatorSummary(legacyId)).toEqual(avatar.profile);
    expect(await resolvePublicCreatorProfile(base + "_2")).toBeNull();
  }, 60000);

  it("refuses inactive accounts, including one that already owns a creator", async () => {
    const principal = owner();
    const profile = await ensureCreatorForOwner(principal);
    await withWriteTransaction(async (tx) => {
      await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, principal.userId));
    });
    vi.clearAllMocks();
    await expect(ensureCreatorForOwner(principal)).rejects.toThrow("This account is not active.");
    expect(await getCreatorSummary(profile.id)).toEqual(profile);
    expect(external.after).not.toHaveBeenCalled();
    const inactive = owner();
    await withWriteTransaction(async (tx) => { await tx.insert(profileAccounts).values({ userId: inactive.userId, status: "deleting" }); });
    await expect(ensureCreatorForOwner(inactive)).rejects.toThrow("This account is not active.");
  }, 60000);

  it("rolls back the account, creator and alias when creation fails before commit", async () => {
    const principal = owner();
    external.getUser.mockResolvedValue({ fullName: "Rollback fixture", username: "rollback_" + suffix, imageUrl: "" });
    external.rollbackNext = true;
    await expect(ensureCreatorForOwner(principal)).rejects.toThrow("Forced failure before commit");
    expect(external.after).not.toHaveBeenCalled();
    expect(await resolvePublicCreatorProfile("rollback_" + suffix)).toBeNull();
    await withWriteTransaction(async (tx) => {
      expect(await tx.select().from(creators).where(eq(creators.ownerUserId, principal.userId))).toHaveLength(0);
      expect(await tx.select().from(profileAccounts).where(eq(profileAccounts.userId, principal.userId))).toHaveLength(0);
    });
    expect((await ensureCreatorForOwner(principal)).username).toBe("rollback_" + suffix);
  }, 60000);

  it("distinguishes legacy display summaries from real current and former addresses without leaking private fields", async () => {
    const legacyId = randomUUID();
    const currentId = randomUUID();
    fixtureCreatorIds.push(legacyId, currentId);
    const current = "current_" + suffix;
    const former = "former_" + suffix;
    const orphan = "orphan_" + suffix;
    await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values([
        { id: legacyId, name: "Legacy fixture", handle: "legacy_" + suffix, avatarUrl: "/avatar.svg", recordOrigin: "preview" },
        { id: currentId, name: "Public fixture", username: current, avatarUrl: "/avatar.svg", avatarStorageProvider: "r2", avatarStorageKey: "secret-key", url: "https://example.com", xProfileUrl: "https://x.com/example", xProviderId: "secret-provider-" + suffix, ownerUserId: "secret-owner-" + suffix, editedFields: ["name"], recordOrigin: "preview" },
      ]);
      await tx.insert(creatorUsernameAliases).values([
        { creatorId: currentId, username: current, isCurrent: true },
        { creatorId: currentId, username: former, isCurrent: false },
        { creatorId: legacyId, username: orphan, isCurrent: true },
      ]);
    });
    expect((await getCreatorSummary(legacyId))?.username).toBe("legacy_" + suffix);
    expect(await resolvePublicCreatorProfile("legacy_" + suffix)).toBeNull();
    expect(await resolvePublicCreatorProfile(orphan)).toBeNull();
    const profile = { id: currentId, name: "Public fixture", username: current, avatarUrl: "/avatar.svg", avatarStorageProvider: "r2", websiteUrl: "https://example.com", xProfileUrl: "https://x.com/example" };
    expect(await getCreatorSummary(currentId)).toEqual(profile);
    expect(await resolvePublicCreatorProfile("  " + current.toUpperCase() + "  ")).toEqual({ profile, canonicalUsername: current, isAlias: false });
    expect(await resolvePublicCreatorProfile(former)).toEqual({ profile, canonicalUsername: current, isAlias: true });
    expect(await resolvePublicCreatorProfile("missing_" + suffix)).toBeNull();
    expect(await resolvePublicCreatorProfile("@invalid!")).toBeNull();
    await withWriteTransaction(async (tx) => {
      expect(await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.creatorId, legacyId))).toHaveLength(1);
    });
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);
});
