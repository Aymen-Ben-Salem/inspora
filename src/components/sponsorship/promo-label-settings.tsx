"use client";
import { useId, useState } from "react";
import type { SponsorPromoLabel } from "@/domain/sponsor";
import {
  DEFAULT_PROMO_LABEL,
  PROMO_LABEL_PRESETS,
  PROMO_LABEL_TEXT_MAX,
  type PromoLabel,
} from "@/features/sponsorship/promo-label";
import { campaignType } from "./campaign-typography";
import { PromoLabelBadge } from "./promo-label-badge";

const fieldClass =
  "focus-ring min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm";
const colorFields = [
  ["textColor", "Text"],
  ["backgroundColor", "Background"],
  ["borderColor", "Border"],
] as const;
type ColorKey = (typeof colorFields)[number][0];

/** Shown text and colours of a label that is switched on, for previews. */
export function visiblePromoLabel(label: PromoLabel | null): SponsorPromoLabel | undefined {
  if (!label?.enabled || !label.text.trim()) return undefined;
  return {
    text: label.text.trim(),
    textColor: label.textColor,
    backgroundColor: label.backgroundColor,
    borderColor: label.borderColor,
  };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange(value: string): void }) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`${campaignType.label} block`}>{label}</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="focus-ring h-11 w-11 shrink-0 cursor-pointer rounded-md border border-[#e6e6e6] bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          id={id}
          className={`${fieldClass} font-mono uppercase`}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          value={draft}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);
            const hex = next.startsWith("#") ? next : `#${next}`;
            if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  );
}

export function PromoLabelSettings({
  value,
  onChange,
  disabled,
}: {
  value: PromoLabel | null;
  onChange(value: PromoLabel): void;
  disabled?: boolean;
}) {
  const label = value ?? { ...DEFAULT_PROMO_LABEL, enabled: false };
  const headingId = useId(), hintId = useId();
  const set = (patch: Partial<PromoLabel>) => onChange({ ...label, ...patch });
  const readable = contrast(label.textColor, label.backgroundColor) >= 4.5;
  return (
    <fieldset
      disabled={disabled}
      aria-labelledby={headingId}
      className="space-y-5 border-t border-[#e6e6e6] pt-8 disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className={campaignType.heading}>Promotional label</h2>
          <p id={hintId} className={`${campaignType.body} mt-1 text-[#767676]`}>
            A short sale or offer label in the corner of your feed card.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={label.enabled}
          aria-label="Show promotional label"
          aria-describedby={hintId}
          onClick={() => set({ enabled: !label.enabled, text: label.text.trim() || DEFAULT_PROMO_LABEL.text })}
          className={`focus-ring relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed ${label.enabled ? "bg-[#262626]" : "bg-[#d4d4d4]"}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${label.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </button>
      </div>
      {label.enabled ? (
        <>
          <label className={`${campaignType.label} block`}>
            Label text
            <input
              className={`${fieldClass} mt-2`}
              required
              maxLength={PROMO_LABEL_TEXT_MAX}
              value={label.text}
              onChange={(event) => set({ text: event.target.value })}
              placeholder={DEFAULT_PROMO_LABEL.text}
            />
          </label>
          <div>
            <p className={campaignType.label}>Style</p>
            <div role="group" aria-label="Label style presets" className="mt-2 flex flex-wrap gap-2">
              {(Object.entries(PROMO_LABEL_PRESETS) as [keyof typeof PROMO_LABEL_PRESETS, (typeof PROMO_LABEL_PRESETS)[keyof typeof PROMO_LABEL_PRESETS]][]).map(([name, preset]) => {
                const active = colorFields.every(([key]) => label[key] === preset[key]);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set(preset)}
                    className={`focus-ring relative flex h-14 w-44 cursor-pointer items-end overflow-hidden rounded-md border p-0 disabled:cursor-not-allowed ${active ? "border-[#262626] ring-1 ring-[#262626]" : "border-[#e6e6e6]"}`}
                    style={{ backgroundColor: name === "dark" ? "#0b0b0b" : "#f6f8f8" }}
                  >
                    <span className="sr-only">{name === "dark" ? "Dark media" : "Light media"}</span>
                    <span aria-hidden="true"><PromoLabelBadge label={{ ...preset, text: label.text.trim() || DEFAULT_PROMO_LABEL.text }} /></span>
                  </button>
                );
              })}
            </div>
            <p className={`${campaignType.caption} mt-2 text-[#767676]`}>Pick the style that suits your media, or set your own colours.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {colorFields.map(([key, name]) => (
              <ColorField key={key} label={name} value={label[key]} onChange={(color) => set({ [key]: color } as Record<ColorKey, string>)} />
            ))}
          </div>
          {!readable ? (
            <p className={`${campaignType.caption} text-[#b54708]`}>The text and background colours are close, so the label may be hard to read.</p>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
