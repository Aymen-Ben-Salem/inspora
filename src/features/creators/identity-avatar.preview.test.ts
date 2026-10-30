import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ getUser: vi.fn(), after: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: external.getUser } }) }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: async () => ({ userId: "avatar-quality-test-admin" }) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: external.after }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/features/sponsorship/metadata", () => ({ metadataFetcher: { fetchPublic: external.fetch } }));

import { creators, profileAccounts, adminAuditLogs } from "@/db/schema";
import { requireDatabase } from "@/db/client";
import { withWriteTransaction } from "@/db/write-client";
import { createOwnedAvatarUpload, freezeOwnedAvatarUpload, deleteR2StorageKeys, createR2PresignedUpload, getR2PublicUrl } from "@/storage/r2";
import { createAdminCreator, updateAdminCreator, ensureCreatorForOwner } from "./identity";
import { initializeCreatorAvatar } from "./initial-avatar";
import { DEFAULT_CREATOR_AVATAR } from "./avatar-policy";

describe.skipIf(process.env.RUN_CREATOR_IDENTITY_INTEGRATION !== "1" || process.env.DATA_ENVIRONMENT !== "preview")("avatar quality in isolated Preview rows and storage", () => {
  const ids: string[] = [], owners: string[] = [], keys: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const photo = (size: number) => sharp({ create: { width: size, height: size, channels: 3, background: "#225599" } }).webp().toBuffer();
  const read = (id: string) => requireDatabase().query.creators.findFirst({ where: eq(creators.id, id) });
  const user = () => {
    const userId = `avatar-quality-${suffix}-${owners.length}`;
    owners.push(userId);
    return { userId };
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    external.getUser.mockResolvedValue({ fullName: "Avatar fixture", username: `avatar_${suffix}_${owners.length}`, imageUrl: "https://photo.example/avatar.webp" });
    external.fetch.mockResolvedValue({ url: new URL("https://photo.example/avatar.webp"), bytes: await photo(800) });
  });
  afterAll(async () => {
    await withWriteTransaction(async tx => {
      if (ids.length) {
        const rows = await tx.select({ key: creators.avatarStorageKey }).from(creators).where(inArray(creators.id, ids));
        keys.push(...rows.flatMap(row => row.key ? [row.key] : []));
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, ids));
        await tx.delete(creators).where(inArray(creators.id, ids));
      }
      if (owners.length) await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, owners));
    });
    await deleteR2StorageKeys([...new Set(keys)]);
  });

  it("imports an admin URL into durable 512px storage and preserves it on ordinary edits", async () => {
    const created = await createAdminCreator({ name: "Avatar fixture", username: `admin_avatar_${suffix}`, avatarUrl: "https://photo.example/avatar.webp" });
    ids.push(created.id);
    const saved = (await read(created.id))!;
    keys.push(saved.avatarStorageKey!);
    const response = await fetch(saved.avatarUrl);
    expect(response.ok).toBe(true);
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 512, height: 512, format: "webp" });
    await updateAdminCreator(created.id, { name: "Renamed fixture", username: saved.username!, avatarUrl: saved.avatarUrl });
    expect((await read(created.id))!.avatarStorageKey).toBe(saved.avatarStorageKey);
    expect(external.fetch).toHaveBeenCalledTimes(1);
    external.fetch.mockResolvedValue({ url: new URL("https://photo.example/small.webp"), bytes: await photo(48) });
    await expect(updateAdminCreator(created.id, { name: "Renamed fixture", username: saved.username!, avatarUrl: "https://photo.example/small.webp" })).rejects.toThrow("400");
    expect((await read(created.id))!.avatarStorageKey).toBe(saved.avatarStorageKey);
  }, 60000);

  it("rejects tiny admin and owner uploads using their real R2 bytes", async () => {
    const bytes = await photo(48);
    const admin = await createR2PresignedUpload({ kind: "creator-avatar", contentType: "image/webp" });
    keys.push(admin.storageKey);
    expect((await fetch(admin.uploadUrl, { method: "PUT", headers: admin.headers, body: new Uint8Array(bytes) })).ok).toBe(true);
    await expect(createAdminCreator({ name: "Tiny fixture", username: `tiny_avatar_${suffix}`, avatarUrl: getR2PublicUrl(admin.storageKey), avatarStorageProvider: "r2", avatarStorageKey: admin.storageKey })).rejects.toThrow("400");
    const owner = user();
    for (const size of [48, 600]) {
      const source = await photo(size);
      const upload = await createOwnedAvatarUpload(owner.userId, source.length);
      keys.push(upload.storageKey);
      expect((await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: new Uint8Array(source) })).ok).toBe(true);
      const result = freezeOwnedAvatarUpload(owner.userId, { storageKey: upload.storageKey, size: source.length });
      if (size === 48) await expect(result).rejects.toThrow("400");
      else {
        const stored = await result;
        keys.push(stored.storageKey);
        const response = await fetch(stored.url);
        expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 512, height: 512 });
      }
    }
  }, 60000);

  it("returns a default at signup, imports once afterward, and keeps signup available on failure", async () => {
    const owner = user();
    const created = await ensureCreatorForOwner(owner);
    ids.push(created.id);
    expect(created.avatarUrl).toBe(DEFAULT_CREATOR_AVATAR);
    expect(external.fetch).not.toHaveBeenCalled();
    await external.after.mock.calls[0]![0]();
    expect((await read(created.id))!.avatarStorageProvider).toBe("r2");
    await ensureCreatorForOwner(owner);
    expect(external.after).toHaveBeenCalledTimes(1);
    expect(external.fetch).toHaveBeenCalledTimes(1);
    const second = await ensureCreatorForOwner(user());
    ids.push(second.id);
    external.fetch.mockRejectedValue(new Error("Provider unavailable"));
    await external.after.mock.calls[1]![0]();
    expect((await read(second.id))!.avatarUrl).toBe(DEFAULT_CREATOR_AVATAR);
  }, 60000);

  it("cannot overwrite a manual edit made while the provider photo is arriving", async () => {
    const owner = user();
    const created = await ensureCreatorForOwner(owner);
    ids.push(created.id);
    external.fetch.mockImplementationOnce(async () => {
      await withWriteTransaction(tx => tx.update(creators).set({ avatarUrl: "/manual-avatar.svg", editedFields: ["avatarUrl"] }).where(eq(creators.id, created.id)));
      return { url: new URL("https://photo.example/avatar.webp"), bytes: await photo(800) };
    });
    expect(await initializeCreatorAvatar(created.id, owner.userId, { imageUrl: "https://photo.example/avatar.webp" })).toBe(false);
    expect((await read(created.id))!.avatarUrl).toBe("/manual-avatar.svg");
  }, 60000);
});
