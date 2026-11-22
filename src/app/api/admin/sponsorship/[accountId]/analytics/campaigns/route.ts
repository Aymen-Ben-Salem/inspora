import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/auth/require-admin";
import { sponsorAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { readAccountCampaignComparison } from "@/features/sponsorship/campaign-comparison";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    await requireAdmin();
    const accountId = z.uuid().parse((await context.params).accountId);
    const [account] = await withWriteTransaction(tx =>
      tx.select({ id: sponsorAccounts.id }).from(sponsorAccounts).where(eq(sponsorAccounts.id, accountId)));
    if (!account) throw new Error("Sponsor report unavailable.");
    return Response.json({ campaigns: await readAccountCampaignComparison(account.id) }, { headers });
  } catch {
    return Response.json({ message: "Sponsor report access unavailable." }, { status: 403, headers });
  }
}
