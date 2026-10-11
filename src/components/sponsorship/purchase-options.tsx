"use client";
import { useId } from "react";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";

export function PurchaseOptions({ value, onChange, disabled = false }: {
  value: SponsorBillingMode; onChange: (mode: SponsorBillingMode) => void; disabled?: boolean;
}) {
  const name = useId();
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="text-lg font-medium">Payment</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {([['one_time', 'One-time', 'One calendar month. A single payment, with no automatic renewal.'],
        ['subscription', 'Monthly', 'Renews every calendar month until you cancel future renewal.']] as const).map(([mode, title, copy]) =>
        <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${value === mode ? 'border-[#262626] bg-[#fafafa]' : 'border-[#e6e6e6] hover:border-[#bfbfbf]'} ${disabled ? 'cursor-default' : ''}`}>
          <input type="radio" name={name} value={mode} checked={value === mode} onChange={() => onChange(mode)} className="focus-ring mt-1 accent-[#262626]" />
          <span><span className="block text-sm font-medium">{title}</span><span className="mt-2 block text-xs leading-5 text-[#767676]">{copy}</span></span>
        </label>)}
    </div>
    <p className="text-xs leading-5 text-[#767676]">USD 500 or EUR 500 before applicable tax. Review your currency and total in checkout.</p>
  </fieldset>;
}
