import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { creatorUsernameAliases } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";

// Callers hold the creator lock and validate username availability in this transaction.
export async function setCurrentUsernameAlias(
  tx: WriteTx,
  creatorId: string,
  username: string,
) {
  const [existing] = await tx
    .select({ id: creatorUsernameAliases.id })
    .from(creatorUsernameAliases)
    .where(and(
      eq(creatorUsernameAliases.creatorId, creatorId),
      eq(sql`lower(${creatorUsernameAliases.username})`, username),
    ))
    .limit(1);
  await tx.update(creatorUsernameAliases)
    .set({ isCurrent: false })
    .where(and(
      eq(creatorUsernameAliases.creatorId, creatorId),
      eq(creatorUsernameAliases.isCurrent, true),
    ));
  if (existing) {
    await tx.update(creatorUsernameAliases)
      .set({ isCurrent: true })
      .where(eq(creatorUsernameAliases.id, existing.id));
  } else {
    await tx.insert(creatorUsernameAliases).values({
      creatorId,
      username,
      isCurrent: true,
    });
  }
}
