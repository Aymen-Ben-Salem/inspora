"use server";

import { auth } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { creatorClaimRequestSchema } from "./claim-validation";
import { changeOwnClaim, CreatorClaimError, requestCreatorClaim, synchronizeOwnedXIdentity } from "./identity/claim-requests";
import { refreshCommittedClaim } from "./identity/claims";
import type { ClaimActionState } from "./types";
import { XLookupError } from "./x-api";

function failure(error: unknown): ClaimActionState {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? "Check your request." };
  if (error instanceof CreatorClaimError) return { status: "error", message: error.message };
  if (error instanceof XLookupError) return { status: "error", message: error.message };
  console.error("Creator claim action failed", error);
  return { status: "error", message: "We could not complete this request. Please try again." };
}

export async function submitCreatorClaimAction(_state: ClaimActionState, data: FormData): Promise<ClaimActionState> {
  try {
    const { userId } = await auth();
    if (!userId) return { status: "error", message: "Sign in before submitting a claim." };
    const input = creatorClaimRequestSchema.parse({ targetCreatorId: data.get("targetCreatorId"), method: data.get("method"),
      confirmed: data.get("confirmed") === "on", evidenceUrl: data.get("evidenceUrl"), evidenceNote: data.get("evidenceNote") });
    const result = await requestCreatorClaim({ userId }, input);
    refreshCommittedClaim();
    return result.status === "pending" ? { status: "success", message: "Your report has been sent. You can follow its status in Your claims." }
      : result.status === "claimed" ? { status: "success", message: "This creator profile is now yours. Your credited work and previous profile addresses have been preserved." }
      : result.status === "already_owned" ? { status: "success", message: "You already manage this creator. Open Your profile to edit it." }
        : { status: "error", message: "This request could not be submitted. Reload and try again." };
  } catch (error) { return failure(error); }
}

export async function changeOwnClaimAction(_state: ClaimActionState, data: FormData): Promise<ClaimActionState> {
  try {
    const { userId } = await auth();
    if (!userId) return { status: "error", message: "Sign in to manage your claims." };
    const id = z.uuid().parse(data.get("claimId"));
    const operation = z.enum(["withdraw", "dismiss"]).parse(data.get("operation"));
    await changeOwnClaim({ userId }, id, operation);
    refreshCommittedClaim();
    return { status: "success", message: operation === "withdraw" ? "Request withdrawn. You can submit a new request with corrected evidence." : "Notification dismissed. The decision remains in Your claims." };
  } catch (error) { return failure(error); }
}

export async function synchronizeOwnXAction(confirmChange: boolean) {
  try {
    const { userId } = await auth();
    if (!userId) return { status: "error" as const, message: "Sign in to update your X identity." };
    const result = await synchronizeOwnedXIdentity({ userId }, confirmChange === true);
    if (result.status === "synced") refreshCommittedClaim(true);
    return result;
  } catch (error) { return failure(error); }
}
