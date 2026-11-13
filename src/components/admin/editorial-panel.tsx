"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { editorialProposalSchema, selectedEditorialPatch, type EditorialField, type EditorialKind, type EditorialProposal } from "@/features/admin/editorial-contract";
import { snapshotFromForm, type EditorialSnapshot } from "@/features/admin/editorial-snapshot";
import { prepareEditorialEvidence } from "@/features/admin/editorial-evidence";

type Result = { id: string; proposal: EditorialProposal; before: EditorialSnapshot; costUsd: number; cached: boolean };
const button = "focus-ring min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-[#eeefeb] active:bg-[#e4e7e0] disabled:cursor-not-allowed disabled:opacity-45";
const primary = `${button} !border-[#262626] !bg-[#262626] text-white hover:!bg-[#41413e]`;
const label = (field: string) => ({ industries: "Industry", industry: "Industry", styles: "Style", colors: "Color", categories: "Categories", themes: "Theme", tagline: "Feed description", category: "Category", description: "Description" }[field] ?? field);

export default function EditorialPanel({ kind, onCategory, autoStart = false }: { kind: EditorialKind; onCategory?: (value: string) => void; autoStart?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<EditorialField[]>([]);
  const [notes, setNotes] = useState(true);
  const [review, setReview] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [showApplied, setShowApplied] = useState(false);
  const started = useRef(false);
  const form = useCallback(() => { const found = root.current?.closest("form"); if (!found) throw new Error("Work form unavailable."); return found; }, []);
  const generate = useCallback(async (regenerate = false) => {
    if (running.current) return;
    running.current = true; setBusy(true); setFailed(false); setMessage("Reading your media..."); setReview(""); setShowApplied(false);
    try {
      const before = snapshotFromForm(form(), kind);
      if (!before.title) {
        (form().elements.namedItem("title") as HTMLInputElement | null)?.focus();
        throw new Error("Add a title above, then generate the details.");
      }
      const images = await prepareEditorialEvidence(before);
      setMessage("Writing your description and categories...");
      const response = await fetch("/api/admin/editorial", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, snapshot: before, images, ...(regenerate ? { regeneration: crypto.randomUUID() } : {}) }), signal: AbortSignal.timeout(85000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Generation failed.");
      const proposal = editorialProposalSchema.parse(body.proposal);
      setResult({ ...body, proposal, before }); setSelected(proposal.fields.map(f => f.field)); setNotes(true);
      setMessage("Your suggestions are ready to review.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not prepare suggestions. Try again when you are ready."); }
    finally { running.current = false; setBusy(false); }
  }, [form, kind]);
  useEffect(() => {
    // The parent mounts this panel only after an explicit Generate click.
    // The ref also prevents a duplicate request under Strict Mode.
    if (autoStart && !started.current) { started.current = true; void generate(); }
  }, [autoStart, generate]);
  async function decide(action: "applied" | "rejected") {
    if (!result) return;
    const response = await fetch("/api/admin/editorial", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: result.id, selected, notes, action }) });
    if (!response.ok) throw new Error("The review could not be recorded. Try again.");
  }
  async function apply() {
    if (!result || busy) return;
    setBusy(true); setFailed(false); setMessage("Adding your selections to the form...");
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
      setMessage("Details added to your form. Nothing is published yet.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not apply suggestions."); }
    finally { setBusy(false); }
  }
  async function dismiss() {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      await decide("rejected"); setReview(""); setResult(null); setShowApplied(false);
      setMessage("Suggestions cleared. Text already added stays in your form; search notes will not be saved.");
    } catch { setFailed(true); setMessage("Could not clear the suggestions. Please try again."); }
    finally { setBusy(false); }
  }
  const applied = !!review;
  return <div ref={root} className="min-w-0 space-y-4" aria-busy={busy}>
    <input type="hidden" name="editorialReview" value={review} />
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-medium text-[#262626]">{applied ? "Details added" : result ? "Choose what to use" : "A hand with the details"}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[#62625d]">{applied ? "Check the fields below, then save when you're ready." : result ? "Checked items will be added to the fields below." : "A description, categories and search notes, ready for your review."}</p>
      </div>
      {result && !busy && <span className="text-xs leading-6 text-[#62625d]">{result.cached ? "Reused - no new charge" : `Estimated cost $${result.costUsd.toFixed(4)}`}</span>}
    </div>
    {(busy || failed || (!result && message)) && <div role={failed ? "alert" : "status"} aria-live="polite" className={failed ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" : busy ? "border-l-2 border-[#62625d] py-2 pl-3 text-sm text-[#262626]" : "text-sm text-[#62625d]"}>
      {(busy || failed || !result) && message}
      {busy && <p className="mt-1 text-xs text-[#62625d]">You can keep editing. Changes are never applied automatically.</p>}
    </div>}
    {applied && <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} aria-expanded={showApplied} onClick={() => setShowApplied(v => !v)}>{showApplied ? "Hide review" : "View review"}</button>
      <button type="button" className={button} disabled={busy} onClick={dismiss}>Clear AI review</button>
    </div>}
    {result && (!applied || showApplied) && <div>
      <div className="divide-y divide-[#deded8] border-y border-[#deded8]">
        {result.proposal.fields.map(change => <div key={change.field} className="grid gap-2 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-2 pt-2 text-sm font-medium">
            <input className="mt-0.5 size-4 shrink-0 accent-[#262626]" type="checkbox" disabled={busy || applied} checked={selected.includes(change.field)} onChange={e => setSelected(values => e.target.checked ? [...values, change.field] : values.filter(f => f !== change.field))} />{label(change.field)}
          </label>
          <div className="min-w-0 py-1 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap break-words">{change.value || "Leave unset"}</p>

          </div>
        </div>)}
        <div className="grid gap-2 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-2 pt-2 text-sm font-medium"><input className="mt-0.5 size-4 shrink-0 accent-[#262626]" type="checkbox" checked={notes} disabled={busy || applied} onChange={e => setNotes(e.target.checked)} />Search notes</label>
          <div className="min-w-0 py-1 text-sm leading-relaxed">
            <p className="text-[#62625d]">Extra visual details to help people find this work. Only used by search.</p>
            <details className="mt-1"><summary className="focus-ring min-h-11 w-fit cursor-pointer py-3 text-xs text-[#62625d] underline-offset-4 hover:underline">Read search notes</summary>
              <div className="space-y-2 pb-2"><p>{result.proposal.hiddenNotes.visualNotes}</p>{result.proposal.hiddenNotes.typography && <p><span className="font-medium">Font style: </span>{result.proposal.hiddenNotes.typography}</p>}</div>
            </details>
          </div>
        </div>
      </div>
      <details className="mt-2 text-sm text-[#62625d]">
        <summary className="focus-ring min-h-11 w-fit cursor-pointer py-3 underline-offset-4 hover:underline">Compare with current details</summary>
        <dl className="divide-y divide-black/10">{result.proposal.fields.map(change => <div key={change.field} className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="font-medium">{label(change.field)}</dt><dd className="min-w-0 space-y-1"><p className="whitespace-pre-wrap break-words">{result.before.current[change.field] || "Empty"}</p><p className="text-xs leading-relaxed">{change.reason}</p></dd></div>)}</dl>
      </details>
      {result.proposal.uncertainty.length > 0 && <div className="mt-4 border-l-2 border-[#b48a3a] bg-[#faf5e9] px-4 py-3 text-sm leading-relaxed text-[#654c21]"><p className="font-medium">Worth a check</p><ul className="mt-1 list-disc space-y-1 pl-4">{result.proposal.uncertainty.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      {!applied && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className={primary} disabled={busy || (!selected.length && !notes)} onClick={apply}>Use selected details</button>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => generate(true)}>Try again (paid)</button><button type="button" className={button} disabled={busy} onClick={dismiss}>Discard suggestions</button></div>
      </div>}
    </div>}
    {applied && <p className="text-xs leading-relaxed text-[#62625d]">Editing the title, media or these details needs a new AI review to save search notes. You can clear the AI review and keep editing manually.</p>}
    {!result && !busy && <button type="button" className={primary} onClick={() => generate()}>Generate details</button>}
  </div>;
}
