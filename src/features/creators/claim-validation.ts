import { z } from "zod";

const evidenceUrl = z.string().trim().max(2048).url("Enter a public portfolio or evidence URL.").refine((value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Enter an http or https URL without credentials.");

export const creatorClaimRequestSchema = z.discriminatedUnion("method", [
  z.object({ targetCreatorId: z.uuid(), method: z.literal("x"), confirmed: z.literal(true) }),
  z.object({ targetCreatorId: z.uuid(), method: z.enum(["manual", "ownership_report"]), confirmed: z.literal(true),
    evidenceUrl, evidenceNote: z.string().trim().min(20, "Explain your connection to this creator in at least 20 characters.").max(2000) }),
]);
export type CreatorClaimRequest = z.infer<typeof creatorClaimRequestSchema>;

export const creatorClaimReviewSchema = z.object({
  claimId: z.uuid(), decision: z.enum(["approve", "reject", "resolve"]),
  version: z.string().regex(/^[a-f0-9]{64}$/, "Reload the claim review before submitting."),
  reason: z.string().trim().max(2000), evidenceConfirmed: z.boolean(),
});
