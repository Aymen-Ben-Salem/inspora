import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { requireDatabase } from "@/db/client";
import { creatorUsernameAliases } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";

type AliasDatabase = WriteTx | ReturnType<typeof requireDatabase>;

// Internal to identity. The legacy work batch adapter uses the same alias policy
// until its callers migrate to transactions. Do not expose this through index.ts.
export async function currentUsernameAliasWrites(
  database: AliasDatabase,
  creatorId: string,
  username: string,
) {
  const [existing] = await database
    .select({ id: creatorUsernameAliases.id })
    .from(creatorUsernameAliases)
    .where(and(
      eq(creatorUsernameAliases.creatorId, creatorId),
      eq(sql`lower(${creatorUsernameAliases.username})`, username),
    ))
    .limit(1);
  return [
    database.update(creatorUsernameAliases)
      .set({ isCurrent: false })
      .where(and(
        eq(creatorUsernameAliases.creatorId, creatorId),
        eq(creatorUsernameAliases.isCurrent, true),
      )),
    existing
      ? database.update(creatorUsernameAliases)
          .set({ isCurrent: true })
          .where(eq(creatorUsernameAliases.id, existing.id))
      : database.insert(creatorUsernameAliases).values({ creatorId, username, isCurrent: true }),
  ] as const;
}

// Callers hold the creator lock and validate username availability in this transaction.
export async function setCurrentUsernameAlias(tx: WriteTx, creatorId: string, username: string) {
  for (const write of await currentUsernameAliasWrites(tx, creatorId, username)) {
    await write;
  }
}
