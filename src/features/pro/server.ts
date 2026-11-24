import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { withWriteTransaction } from "@/db/write-client";
import { getConfiguredAdminUserIds } from "@/auth/config";
import { getConfiguredMcpTrialUserIds } from "@/features/inspora-catalog/mcp-trial-access";
import { proFeatureEnabled, proStripeConfig } from "./config";
import { assertProStripeObjectMode, proSiteOrigin } from "./payment-environment";
import { createProService, type WithProTransaction } from "./service";
import { proBillingProvider, proStripeClient } from "./stripe";
import { createProWebhookReceiver } from "./webhook";
import { readAccess } from "./repository";

// The Neon transaction is structurally the same Drizzle Postgres transaction the repository expects.
export const withProTransaction: WithProTransaction = (work) => withWriteTransaction((tx) => work(tx as never));

/**
 * Pro buyers delete their identity through Inspora's subscription warning and
 * billing closure flow. Clerk's Backend API can still complete that confirmed deletion.
 */
export async function prepareProIdentity(userId: string) {
  if (!proFeatureEnabled()) throw new Error("Inspora Pro is unavailable.");
  const clerk = await clerkClient();
  const user = await clerk.users.updateUser(userId, { deleteSelfEnabled: false });
  if (user.deleteSelfEnabled !== false) throw new Error("The Pro account deletion safeguard could not be established.");
}

export function proService() {
  return createProService({ withTx: withProTransaction, provider: proBillingProvider, siteOrigin: () => proSiteOrigin(), prepareIdentity: prepareProIdentity });
}

export function isMcpTrialUser(userId: string) {
  return getConfiguredAdminUserIds().has(userId) || getConfiguredMcpTrialUserIds().has(userId);
}

/** Current verified Pro entitlement (not an OAuth claim). Used by consent under the `pro` access policy. */
export async function hasActivePro(userId: string) {
  if (!proFeatureEnabled()) return false;
  const access = await withProTransaction((tx) => readAccess(tx, userId, new Date()));
  return access.entitlement.active;
}

export function proWebhookReceiver() {
  const secret = proStripeConfig()?.webhookSecret;
  if (!proFeatureEnabled() || !secret) throw new Error("Pro webhook is unavailable.");
  const stripe = proStripeClient();
  const service = proService();
  return createProWebhookReceiver({
    verify(raw, signature) {
      const event = stripe.webhooks.constructEvent(raw, signature, secret);
      const object = event.data.object as { id?: string; livemode?: boolean };
      return { id: event.id, type: event.type, livemode: event.livemode, objectId: object.id, objectLivemode: object.livemode };
    },
    assertMode: (object) => assertProStripeObjectMode(object),
    withTx: withProTransaction,
    handle: (type, objectId) => service.handleEvent(type, objectId),
  });
}
