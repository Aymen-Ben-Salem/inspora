import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creatorViewSnapshots } from "@/db/schema";

export type ViewSnapshot = { count: number; asOf: string };
export async function readViewSnapshot(key: string, eligibilityFingerprint: string): Promise<ViewSnapshot | null> {
  const [row] = await requireDatabase().select().from(creatorViewSnapshots).where(and(
    eq(creatorViewSnapshots.key, key), eq(creatorViewSnapshots.eligibilityFingerprint, eligibilityFingerprint),
  )).limit(1);
  if (!row || !Number.isSafeInteger(row.count) || row.count < 0 || !Number.isFinite(row.asOf.getTime())) return null;
  return { count: row.count, asOf: row.asOf.toISOString() };
}
export async function writeViewSnapshot(key: string, eligibilityFingerprint: string, snapshot: ViewSnapshot) {
  const values = { key, eligibilityFingerprint, count: snapshot.count, asOf: new Date(snapshot.asOf) };
  await requireDatabase().insert(creatorViewSnapshots).values(values).onConflictDoUpdate({
    target: creatorViewSnapshots.key, set: values,
    // A slower request must not overwrite a newer successful sample.
    setWhere: lte(creatorViewSnapshots.asOf, values.asOf),
  });
}
