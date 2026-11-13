import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { editorialGenerations, workEditorialNotes } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { editorialProposalSchema, type EditorialKind } from "./editorial-contract";
import { editorialSnapshot, stableSnapshot, type EditorialSnapshot } from "./editorial-snapshot";
import { withEditorialLedger } from "./editorial-ledger";
import { editorialContentHash } from "../../../tools/inspora-mcp/editorial-notes.mjs";

export class EditorialReviewError extends Error {}
const reviewSchema = z.object({ id: z.uuid(), selected: z.array(z.string().max(30)).max(6), notes: z.boolean() });

export async function recordEditorialDecision(raw: unknown, actorId: string) {
  const decision = reviewSchema.extend({ action: z.enum(["applied", "rejected"]) }).parse(raw);
  await withEditorialLedger(async tx => {
    await tx.update(editorialGenerations).set({ decision: { ...decision, at: new Date().toISOString() } })
      .where(and(eq(editorialGenerations.id, decision.id), eq(editorialGenerations.actorId, actorId), eq(editorialGenerations.environment, process.env.DATA_ENVIRONMENT ?? "unknown")));
  });
  return { ok: true };
}

export async function prepareEditorialReview(kind: EditorialKind, input: Record<string, unknown>, actorId: string) {
  if (!input.editorialReview) return null;
  try {
    const review = reviewSchema.parse(JSON.parse(String(input.editorialReview)));
    const [job] = await withEditorialLedger(tx => tx.select().from(editorialGenerations).where(and(
      eq(editorialGenerations.id, review.id), eq(editorialGenerations.actorId, actorId),
      eq(editorialGenerations.environment, process.env.DATA_ENVIRONMENT ?? "unknown"), eq(editorialGenerations.state, "ready"))));
    if (!job) throw new Error("Missing proposal");
    const proposal = editorialProposalSchema.parse(job.proposal);
    const expected = structuredClone(job.snapshot) as EditorialSnapshot;
    if (expected.kind !== kind) throw new Error("Wrong work kind");
    for (const field of review.selected) {
      const item = proposal.fields.find(f => f.field === field);
      if (!item) throw new Error("Unknown field");
      expected.current[item.field] = item.value;
    }
    if (stableSnapshot(expected) !== stableSnapshot(editorialSnapshot(kind, input))) throw new Error("Changed work");
    return { jobId: job.id, notes: review.notes ? proposal.hiddenNotes : null, evidence: job.evidence };
  } catch {
    throw new EditorialReviewError("The work changed after editorial review. Clear the reviewed suggestions or generate again before saving.");
  }
}

export async function saveEditorialReview(tx: WriteTx, workId: string, kind: EditorialKind, input: Record<string, unknown>, actorId: string, review: Awaited<ReturnType<typeof prepareEditorialReview>>) {
  if (!review?.notes) return;
  const snapshot = editorialSnapshot(kind, input);
  const row = { ...input, kind, source_url: input.sourceUrl,
    media: snapshot.media.map(m => ({ ...m, poster: m.posterUrl || null })) };
  await tx.insert(workEditorialNotes).values({ workId, kind, contentHash: editorialContentHash(row), notes: review.notes,
    evidence: review.evidence, generationId: review.jobId, reviewedBy: actorId });
}
