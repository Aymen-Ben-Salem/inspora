"use client";

import { useId, useState, useTransition } from "react";
import { createCategoryAction } from "@/features/admin/category-actions";

const inputClass = "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm";

export function CategoryPicker({ categories, initialCategory = "Branding" }: {
  categories: string[];
  initialCategory?: string;
}) {
  const id = useId();
  const [added, setAdded] = useState<string[]>([]);
  const [selected, setSelected] = useState(initialCategory);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const options = [...new Set([...categories, ...added, selected])];

  function create() {
    if (pending || !name.trim()) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await createCategoryAction(name);
        if (result.status === "error") { setError(result.message); return; }
        setAdded((current) => [...current, result.name]);
        setSelected(result.name);
        setName("");
        setCreating(false);
      } catch {
        setError("The category could not be created. Try again.");
      }
    });
  }

  return (
    <div className="grid content-start gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="font-medium text-[#333]">Category</label>
        <button type="button" className="focus-ring text-xs underline underline-offset-4"
          aria-expanded={creating} aria-controls={`${id}-create`}
          onClick={() => { setCreating(!creating); setError(""); }} disabled={pending}>
          {creating ? "Cancel" : "Create category"}
        </button>
      </div>
      <select id={id} className={inputClass} name="category" value={selected}
        onChange={(event) => setSelected(event.target.value)}>
        {options.map((category) => <option key={category}>{category}</option>)}
      </select>
      {creating ? (
        <div id={`${id}-create`} className="grid gap-2 rounded-xl bg-[#f7f7f4] p-3">
          <label htmlFor={`${id}-name`} className="font-medium">New category name</label>
          <input id={`${id}-name`} className={inputClass} value={name} maxLength={60}
            autoFocus disabled={pending} placeholder="e.g. Typography"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }} />
          <button type="button" onClick={create} disabled={pending || !name.trim()}
            className="focus-ring rounded-full bg-black px-4 py-2 text-white disabled:opacity-40">
            {pending ? "Creating?" : "Save category"}
          </button>
          {error ? <p role="alert" className="text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
