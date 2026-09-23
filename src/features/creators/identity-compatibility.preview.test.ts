import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { resolveCreatorMutation } from "./repository";
import type { AdminCreatorInput } from "./types";

const enabled = process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";

describe.skipIf(!enabled)("legacy work attribution compatibility in guarded preview", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const ids: string[] = [];

  beforeAll(async () => {
    // Check the guarded transaction connection before any legacy HTTP writes.
    await withWriteTransaction((tx) => tx.execute(sql`select 1`));
  });

  afterAll(async () => {
    if (!ids.length) return;
    await withWriteTransaction((tx) => tx.delete(creators).where(inArray(creators.id, ids)));
  });

  const save = async (input: AdminCreatorInput) => {
    const database = requireDatabase();
    const result = await resolveCreatorMutation(database, input);
    if (!input.id) ids.push(result.id);
    await database.batch(result.mutations);
    return result;
  };

  it("reactivates a former alias and retains restored avatar metadata", async () => {
    const alpha = "compat_a_" + suffix;
    const beta = "compat_b_" + suffix;
    const input: AdminCreatorInput = {
      name: "Compatibility fixture", username: alpha,
      avatarUrl: "/compat-avatar.webp", avatarStorageProvider: "r2",
      avatarStorageKey: "creators/compat-" + suffix + ".webp",
    };
    const created = await save(input);
    await save({ ...input, id: created.id, username: beta });
    const restored = await save({ ...input, id: created.id, avatarStorageProvider: undefined, avatarStorageKey: undefined });
    expect(restored.removedManagedMedia).toEqual([]);
    await withWriteTransaction(async (tx) => {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, created.id));
      expect(creator).toMatchObject({ username: alpha, avatarStorageProvider: "r2", avatarStorageKey: input.avatarStorageKey });
      const aliases = await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.creatorId, created.id));
      expect(aliases).toHaveLength(2);
      expect(aliases.filter((alias) => alias.isCurrent).map((alias) => alias.username)).toEqual([alpha]);
    });
    const replaced = await save({ ...input, id: created.id, avatarUrl: "/replacement.webp", avatarStorageProvider: undefined, avatarStorageKey: undefined });
    expect(replaced.removedManagedMedia).toEqual([{ storageProvider: "r2", storageKey: input.avatarStorageKey, type: "image" }]);
  }, 60_000);

  it("refuses another creator's reserved former username", async () => {
    const alpha = "compat_owner_" + suffix;
    const first = await save({ name: "First", username: alpha, avatarUrl: "/avatar.svg" });
    await save({ id: first.id, name: "First", username: "compat_next_" + suffix, avatarUrl: "/avatar.svg" });
    await expect(save({ name: "Second", username: alpha, avatarUrl: "/avatar.svg" })).rejects.toMatchObject({ code: "conflict" });
  }, 60_000);
});
