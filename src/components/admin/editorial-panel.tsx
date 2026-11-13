"use client";
import { useRef, useState } from "react";
import { editorialProposalSchema, selectedEditorialPatch, type EditorialField, type EditorialKind, type EditorialProposal } from "@/features/admin/editorial-contract";
import { snapshotFromForm, type EditorialSnapshot } from "@/features/admin/editorial-snapshot";
import { prepareEditorialEvidence } from "@/features/admin/editorial-evidence";

type Result = { id: string; proposal: EditorialProposal; before: EditorialSnapshot; costUsd: number; cached: boolean };
const button = "focus-ring rounded-full border border-black/20 px-4 py-2 text-sm disabled:opacity-40";
const label = (field: string) => ({ industries: "Industry", industry: "Industry", styles: "Style", colors: "Color", categories: "Categories", themes: "Theme", tagline: "Feed description", category: "Category", description: "Description" }[field] ?? field);

export default function EditorialPanel({ kind, onCategory }: { kind: EditorialKind; onCategory?: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<EditorialField[]>([]);
  const [notes, setNotes] = useState(true);
  const [review, setReview] = useState("");
  const [message, setMessage] = useState("");
  const [attempted, setAttempted] = useState(false);
  const form = () => { const found = root.current?.closest("form"); if (!found) throw new Error("Work form unavailable."); return found; };
  async function generate(regenerate = false) {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("Preparing visual samples…"); setReview("");
    try {
      const before = snapshotFromForm(form(), kind);
      if (!before.title) throw new Error("Add the work title first.");
      const images = await prepareEditorialEvidence(before);
      setMessage("Generating suggestions. This usually takes a few seconds…"); setAttempted(true);
      const response = await fetch("/api/admin/editorial", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, snapshot: before, images, ...(regenerate ? { regeneration: crypto.randomUUID() } : {}) }), signal: AbortSignal.timeout(85000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Generation failed.");
      const proposal = editorialProposalSchema.parse(body.proposal);
      setResult({ ...body, proposal, before }); setSelected(proposal.fields.map(f => f.field)); setNotes(true);
      setMessage(body.cached ? "Reused the existing suggestions without another paid request." : `Suggestions ready. Estimated API cost: $${Number(body.costUsd).toFixed(4)}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not prepare suggestions."); }
    finally { running.current = false; setBusy(false); }
  }
  async function decide(action: "applied" | "rejected") {
    if (!result) return;
    const response = await fetch("/api/admin/editorial", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: result.id, selected, notes, action }) });
    if (!response.ok) throw new Error("The review could not be recorded. Try again.");
  }
  async function apply() {
    if (!result || busy) return;
    setBusy(true);
    try {
      const current = snapshotFromForm(form(), kind);
      const patch = selectedEditorialPatch({ proposal: result.proposal, selected, before: result.before.current, current: current.current,
        sourceVersion: JSON.stringify(result.before), currentSourceVersion: JSON.stringify(current) });
      await decide("applied");
      // Recheck after the audit request: don't overwrite edits made while awaiting it.
      if (JSON.stringify(snapshotFromForm(form(), kind)) !== JSON.stringify(current)) throw new Error("The work changed. Review it and generate again.");
      for (const [field, value] of Object.entries(patch)) {
        if (field === "category" && onCategory) onCategory(value);
        else {
          const control = form().elements.namedItem(field);
          if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) throw new Error("A selected form field is unavailable.");
          control.value = value; control.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      setReview(JSON.stringify({ id: result.id, selected, notes }));
      setMessage("Selected suggestions applied. Review the form, then save normally. Nothing has been published yet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not apply suggestions."); }
    finally { setBusy(false); }
  }
  return <div ref={root} className="grid gap-4">
    <input type="hidden" name="editorialReview" value={review} />
    <p className="text-xs text-[#666]">Up to six image samples or recording frames. No automatic generation or retries.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => generate()}>Generate suggestions</button>
      {attempted && <button type="button" className={button} disabled={busy} onClick={() => generate(true)}>Regenerate · new paid request</button>}
    </div>
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
    {result && <div className="grid gap-4" aria-busy={busy}>
      {result.proposal.fields.map(change => <div key={change.field} className="rounded-xl border border-black/10 bg-white p-4">
        <label className="flex gap-2 font-medium"><input type="checkbox" disabled={busy || !!review} checked={selected.includes(change.field)} onChange={e => setSelected(values => e.target.checked ? [...values, change.field] : values.filter(f => f !== change.field))} />{label(change.field)}</label>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-[#777]">Current</p><p className="mt-1 whitespace-pre-wrap">{result.before.current[change.field] || "Empty"}</p></div><div><p className="text-xs text-[#777]">Suggested</p><p className="mt-1 whitespace-pre-wrap">{change.value || "Leave unset"}</p></div></div>
        <p className="mt-3 text-xs text-[#666]">{change.reason}</p>
      </div>)}
      <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
        <label className="flex gap-2 font-medium"><input type="checkbox" checked={notes} disabled={busy || !!review} onChange={e => setNotes(e.target.checked)} />Hidden search notes</label>
        <p className="mt-2">{result.proposal.hiddenNotes.visualNotes}</p>
        {result.proposal.hiddenNotes.typography && <p className="mt-2"><strong>Typography: </strong>{result.proposal.hiddenNotes.typography}</p>}
        <p className="mt-2 text-xs text-[#777]">Used by search after you save. Not shown as the public description.</p>
      </div>
      {result.proposal.uncertainty.length > 0 && <div className="rounded-xl bg-amber-50 p-4 text-sm"><p className="font-medium">Check before applying</p><ul className="mt-2 list-disc pl-5">{result.proposal.uncertainty.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${button} bg-black text-white`} disabled={busy || !!review || (!selected.length && !notes)} onClick={apply}>Apply selected to form</button>
        <button type="button" className={button} disabled={busy} onClick={async () => { try { await decide("rejected"); setReview(""); setResult(null); setMessage("Suggestions dismissed. Any text already applied remains editable in the form; hidden notes will not be saved."); } catch { setMessage("Could not record dismissal. Try again."); } }}>Dismiss / clear review</button>
      </div>
      {review && <p className="text-xs text-[#666]">Changing the title, source, media or reviewed fields requires a fresh review before saving hidden notes. Clear review to continue without them.</p>}
    </div>}
  </div>;
}
