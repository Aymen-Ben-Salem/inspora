import "server-only";
import { z } from "zod";
import { requireAdmin } from "@/auth/require-admin";
import { withWriteTransaction } from "@/db/write-client";
import { sponsorAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readMetricsReport } from "./reports";
import type { SponsorRange } from "./types";
export async function readSiteAudienceMetrics(range: SponsorRange) {
  await requireAdmin();
  return readMetricsReport(null, { range });
}
export async function readAdminSponsorMetrics(
  accountId: string,
  range: SponsorRange,
) {
  await requireAdmin();
  z.uuid().parse(accountId);
  const account = await withWriteTransaction(
    async (tx) =>
      (
        await tx
          .select({ id: sponsorAccounts.id })
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.id, accountId))
      )[0],
  );
  if (!account) throw new Error("Sponsor report unavailable.");
  return readMetricsReport(accountId, { range });
}
