import { beforeEach, expect, expectTypeOf, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(() => null), requireDatabase: vi.fn(() => { throw new Error("DATABASE_URL is not configured."); }) }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn(async () => { throw new Error("DATABASE_URL is not configured."); }) }));

import type { CreatorSummary, PublicCreatorProfile } from "./types";
import { getDatabase } from "@/db/client";
import { clerkClient } from "@clerk/nextjs/server";
import { after } from "next/server";
import { ensureCreatorForOwner, resolvePublicCreatorProfile, updateOwnedCreatorProfile, updateOwnedCreatorAvatar } from "./identity";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue(null);
  vi.mocked(clerkClient).mockResolvedValue({ users: { getUser: vi.fn(async () => ({ fullName: "Ada", username: "ada", imageUrl: "" })) } } as never);
});

it("keeps unavailable public lookup separate from a failed owner write", async () => {
  expect(await resolvePublicCreatorProfile("ada")).toBeNull();
  await expect(ensureCreatorForOwner({ userId: "owner" })).rejects.toThrow("DATABASE_URL is not configured.");
  expect(after).not.toHaveBeenCalled();
});

it("rejects a missing principal before accessing provider or persistence", async () => {
  await expect(ensureCreatorForOwner({ userId: "" })).rejects.toThrow("Sign in");
  expect(clerkClient).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it("returns only public profile fields through canonical and alias lookup", async () => {
  const creator = {
    id: "11111111-1111-4111-8111-111111111111", name: "Ada Lovelace", username: "ada_lovelace",
    avatarUrl: "https://img.example/ada.jpg", avatarStorageProvider: "r2", url: "https://ada.example", xProfileUrl: "https://x.com/ada",
    ownerUserId: "user_secret", xProviderId: "provider_secret", editedFields: ["name"], avatarStorageKey: "secret_key", claims: [{ id: "secret_claim" }],
  };
  const findFirst = vi.fn().mockResolvedValue({ username: "ada_old", isCurrent: false, creator });
  vi.mocked(getDatabase).mockReturnValue({ query: { creatorUsernameAliases: { findFirst } } } as never);
  expect(await resolvePublicCreatorProfile(" ADA_OLD ")).toEqual({
    profile: { id: creator.id, name: "Ada Lovelace", username: "ada_lovelace", avatarUrl: "https://img.example/ada.jpg", avatarStorageProvider: "r2", websiteUrl: "https://ada.example", xProfileUrl: "https://x.com/ada" },
    canonicalUsername: "ada_lovelace", isAlias: true,
  });
  findFirst.mockResolvedValue({ username: "ada_lovelace", isCurrent: true, creator });
  expect((await resolvePublicCreatorProfile("ada_lovelace"))?.isAlias).toBe(false);
});

it("requires an actual alias and a current username and rejects invalid lookup input", async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  vi.mocked(getDatabase).mockReturnValue({ query: { creatorUsernameAliases: { findFirst } } } as never);
  for (const username of ["", "ab", "@ada", "ada lovelace", "a".repeat(31)]) {
    expect(await resolvePublicCreatorProfile(username)).toBeNull();
  }
  expect(findFirst).not.toHaveBeenCalled();
  expect(await resolvePublicCreatorProfile("missing")).toBeNull();
  findFirst.mockResolvedValue({ username: "legacy", isCurrent: true, creator: { username: null } });
  expect(await resolvePublicCreatorProfile("legacy")).toBeNull();
  expect(after).not.toHaveBeenCalled();
});

it("keeps owner mutation returns distinct from alias-backed public profiles", () => {
  expectTypeOf<Awaited<ReturnType<typeof updateOwnedCreatorProfile>>>().toEqualTypeOf<CreatorSummary>();
  expectTypeOf<Awaited<ReturnType<typeof updateOwnedCreatorAvatar>>["profile"]>().toEqualTypeOf<CreatorSummary>();
  expectTypeOf<CreatorSummary>().not.toExtend<PublicCreatorProfile>();
});

it("distinguishes unavailable owner writes from unavailable public reads", async () => {
  await expect(updateOwnedCreatorProfile({ userId: "owner" }, { name: "Ada" })).rejects.toMatchObject({ code: "database_unavailable", field: "form" });
  expect(await resolvePublicCreatorProfile("ada")).toBeNull();
  expect(after).not.toHaveBeenCalled();
});
