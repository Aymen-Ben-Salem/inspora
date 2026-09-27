"use client";

import { useId, useRef, useState } from "react";
import type { AdminCreatorAttribution } from "@/features/admin/types";

type CreatorOption = Pick<AdminCreatorAttribution, "id" | "name" | "username" | "legacyHandle">;

export function filterCreators<T extends CreatorOption>(creators: T[], query: string) {
  const normalized = query.trim().replace(/^@/, "").toLocaleLowerCase();
  return creators.filter((creator) => [creator.name, creator.username, creator.legacyHandle]
    .some((value) => value?.toLocaleLowerCase().includes(normalized)));
}

export function CreatorPicker({ creators, selectedId, onSelect }: {
  creators: CreatorOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = filterCreators(creators, query);
  const options = [...filtered.map((creator) => ({
    id: creator.id,
    label: `${creator.name}${creator.username ? ` (@${creator.username})` : creator.legacyHandle ? ` (${creator.legacyHandle})` : ""}`,
  })), { id: "new", label: "Create a new creator" }];
  const selected = creators.find((creator) => creator.id === selectedId);

  function select(value: string) {
    onSelect(value);
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }

  function moveActive(index: number) {
    setActive(index);
    document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="relative grid gap-2" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); setOpen(false); trigger.current?.focus();
      }
    }}>
      <span id={`${id}-label`} className="text-sm font-medium text-[#333]">Select creator</span>
      <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open} aria-controls={`${id}-panel`}
        onClick={() => { setOpen(!open); setQuery(""); setActive(0); }}
        className="focus-ring flex h-11 w-full items-center justify-between rounded-xl border border-black/10 bg-white px-3 text-left text-sm">
        <span id={`${id}-value`}>{selected ? `${selected.name}${selected.username ? ` (@${selected.username})` : selected.legacyHandle ? ` (${selected.legacyHandle})` : ""}` : "Create a new creator"}</span>
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <div id={`${id}-panel`} className="absolute top-full z-20 mt-1 w-full rounded-xl border border-black/10 bg-white p-2 shadow-lg">
          <input autoFocus role="combobox" aria-label="Search creators" aria-expanded="true"
            aria-autocomplete="list" aria-controls={`${id}-list`}
            aria-activedescendant={`${id}-option-${active}`}
            value={query} placeholder="Search by name or username?"
            className="focus-ring h-11 w-full rounded-lg border border-black/10 px-3 text-sm"
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveActive((active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
              } else if (event.key === "Enter") {
                event.preventDefault(); select(options[active].id);
              }
            }} />
          <div id={`${id}-list`} role="listbox" aria-label="Creators" className="mt-2 max-h-64 overflow-y-auto">
            {options.map((option, index) => (
              <div key={option.id} id={`${id}-option-${index}`} role="option"
                aria-selected={(selectedId ?? "new") === option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option.id)}
                onMouseMove={() => setActive(index)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === active ? "bg-[#efefed]" : "hover:bg-[#f7f7f4]"}`}>
                {option.label}
              </div>
            ))}
          </div>
          {!filtered.length ? <p role="status" className="px-3 py-2 text-sm text-[#777]">No existing creators found.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
