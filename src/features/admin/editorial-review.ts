import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { adminAuditLogs, editorialGenerations, workEditorialNotes } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { storedEditorialProposal, type EditorialKind } from "./editorial-contract";
import { editorialHashFromInput } from "./editorial-hash";
import { editorialSnapshot, stableSnapshot, type EditorialSnapshot } from "./editorial-snapshot";
import { withEditorialLedger } from "./editorial-ledger";
import { isAllowedManagedAssetUrl } from "./media-url-validation";

export class EditorialReviewError extends Error {}
const reviewSchema = z.object({
  id: z.uuid(),
  selected: z.array(z.string().max(30)).max(6),
  alts: z.array(z.number().int().min(0).max(19)).max(6).default([]),
  notes: z.boolean(),
});

export type PreparedEditorialReview = Awaited<ReturnType<typeof prepareEditorialReview>>;
export type EditorialNoteStatus = "current" | "stale" | "none";

export async function recordEditorialDecision(raw: unknown, actorId: string) {
  const decision = reviewSchema.extend({ action: z.enum(["applied", "rejected"]) }).parse(raw);
  await withEditorialLedger(async tx => {
    await tx.update(editorialGenerations).set({ decision: { ...decision, at: new Date().toISOString() } })
      .where(and(eq(editorialGenerations.id, decision.id), eq(editorialGenerations.actorId, actorId), eq(editorialGenerations.environment, process.env.DATA_ENVIRONMENT ?? "unknown")));
  });
  return { ok: true };
}

/**
 * Bind a save to the reviewed proposal. `submittedMediaHref` is the private submission
 * file the browser replaces with a managed upload on acceptance: only that item may
 * change its URL, poster and measured size between generation and save.
 */
export async function prepareEditorialReview(kind: EditorialKind, input: Record<string, unknown>, actorId: string, options: { submittedMediaHref?: string } = {}) {
  if (!input.editorialReview) return null;
  try {
    const review = reviewSchema.parse(JSON.parse(String(input.editorialReview)));
    const [job] = await withEditorialLedger(tx => tx.select().from(editorialGenerations).where(and(
      eq(editorialGenerations.id, review.id), eq(editorialGenerations.actorId, actorId),
      eq(editorialGenerations.environment, process.env.DATA_ENVIRONMENT ?? "unknown"), eq(editorialGenerations.state, "ready"))));
    if (!job) throw new Error("Missing proposal");
    const proposal = storedEditorialProposal(job.proposal);
    const expected = structuredClone(job.snapshot) as EditorialSnapshot;
    if (expected.kind !== kind) throw new Error("Wrong work kind");
    for (const field of review.selected) {
      const item = proposal.fields.find(f => f.field === field);
      if (!item) throw new Error("Unknown field");
      expected.current[item.field] = item.value;
    }
    for (const media of review.alts) {
      const alt = proposal.mediaAlt.find(item => item.media === media);
      if (!alt || !expected.media[media]) throw new Error("Unknown alt text");
      expected.media[media].alt = alt.value;
    }
    const actual = editorialSnapshot(kind, input);
    const href = options.submittedMediaHref;
    if (href) {
      expected.media.forEach((item, index) => {
        const saved = actual.media[index];
        if (item.url !== href || !saved || saved.url === href || saved.url.startsWith("/api/") || !isAllowedManagedAssetUrl(saved.url)) return;
        Object.assign(item, { url: saved.url, posterUrl: saved.posterUrl, width: saved.width, height: saved.height });
      });
    }
    if (stableSnapshot(expected) !== stableSnapshot(actual)) throw new Error("Changed work");
    return { jobId: job.id, notes: review.notes ? proposal.hiddenNotes : null, evidence: job.evidence };
  } catch {
    throw new EditorialReviewError("The work changed after editorial review. Clear the reviewed suggestions or generate again before saving.");
  }
}

async function writeNotes(tx: WriteTx, workId: string, kind: EditorialKind, input: Record<string, unknown>, actorId: string, review: NonNullable<PreparedEditorialReview>) {
  const values = { workId, kind, contentHash: editorialHashFromInput(kind, input), notes: review.notes!, evidence: review.evidence,
    generationId: review.jobId, reviewedBy: actorId, reviewedAt: new Date() };
  await tx.insert(workEditorialNotes).values(values).onConflictDoUpdate({ target: workEditorialNotes.workId, set: values });
}

/** Save reviewed notes for a newly created work. */
export async function saveEditorialReview(tx: WriteTx, workId: string, kind: EditorialKind, input: Record<string, unknown>, actorId: string, review: PreparedEditorialReview) {
  if (!review?.notes) return;
  await writeNotes(tx, workId, kind, input, actorId, review);
}

/**
 * On edit: replace notes from a new review (auditing the previous ones), otherwise
 * keep the existing row and report whether the edit left it out of date.
 */
export async function refreshEditorialNotes(tx: WriteTx, workId: string, kind: EditorialKind, input: Record<string, unknown>, actorId: string, review: PreparedEditorialReview): Promise<EditorialNoteStatus> {
  const [existing] = await tx.select().from(workEditorialNotes).where(eq(workEditorialNotes.workId, workId)).for("update");
  if (review?.notes) {
    await writeNotes(tx, workId, kind, input, actorId, review);
    if (existing) {
      await tx.insert(adminAuditLogs).values({ actorId, action: "editorial_notes.replaced", resourceType: kind === "design" ? "post" : kind === "website" ? "website" : "logo", resourceId: workId,
        details: { previousContentHash: existing.contentHash, previousGenerationId: existing.generationId, previousKind: existing.kind, previousNotes: existing.notes } });
    }
    return "current";
  }
  if (!existing) return "none";
  return existing.kind === kind && existing.contentHash === editorialHashFromInput(kind, input) ? "current" : "stale";
}

/** Admin-only, read-only status for the edit page. */
export async function editorialNoteStatus(kind: EditorialKind, workId: string, record: Record<string, unknown>): Promise<EditorialNoteStatus> {
  const [existing] = await requireDatabase().select({ kind: workEditorialNotes.kind, contentHash: workEditorialNotes.contentHash })
    .from(workEditorialNotes).where(eq(workEditorialNotes.workId, workId));
  if (!existing) return "none";
  return existing.kind === kind && existing.contentHash === editorialHashFromInput(kind, record) ? "current" : "stale";
}
