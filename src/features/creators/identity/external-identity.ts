import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { normalizeXUsername } from "../validation";

// Internal provider adapter. Browser input never supplies identity evidence.
export async function verifiedXIdentityForUser(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  for (const account of user.externalAccounts) {
    if (!["oauth_x", "x", "twitter"].includes(account.provider.toLowerCase()) ||
      account.verification?.status !== "verified" || !account.providerUserId?.trim() ||
      !account.username) continue;
    try {
      const username = normalizeXUsername(account.username);
      return { providerAccountId: account.providerUserId.trim(), username, profileUrl: `https://x.com/${username}` };
    } catch {
      // An unusable account must not mask a later valid verified X account.
    }
  }
  return null;
}
