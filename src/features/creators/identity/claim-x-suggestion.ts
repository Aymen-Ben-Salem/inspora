import "server-only";
import { cacheLife } from "next/cache";
import { lookupXAccountById } from "../x-api";

// Keyed by the authenticated stable ID, never an editable profile URL. Keep brief
// visits/reloads from spending another lookup; availability checks never call X.
export async function getClaimXSuggestion(accountId: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const account = await lookupXAccountById(accountId, { includeAvatar: false });
  return { ...(account.name ? { name: account.name } : {}), username: account.username };
}
