"use client";
import { campaignType } from "./campaign-typography";
import { sponsorPriceLabel, type SponsorCurrency } from "@/features/sponsorship/pricing";
import { useId } from "react";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";

export function PurchaseOptions({ value, onChange, disabled = false, reserved = false, currency = "usd" }: {
  value: SponsorBillingMode; onChange: (mode: SponsorBillingMode) => void; disabled?: boolean; reserved?: boolean;
  currency?: SponsorCurrency;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className={`${campaignType.heading} mb-4`}>Payment</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["subscription", "Subscribe", "All three placements, billed monthly."],
          ["one_time", "One-off", "All three placements for one month."],
        ] as const).map(([mode, title, copy]) => (
          <label key={mode} className={`flex flex-col overflow-hidden rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-[#262626] focus-within:ring-offset-2 ${value === mode ? "border-[#262626]" : "border-[#e6e6e6]"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#262626]"}`}>
            <span className="flex flex-1 flex-col gap-3 p-5">
              <span className="flex items-center justify-between gap-3">
                <span className={campaignType.label}>{title}</span>
                <input type="radio" aria-label={title} name={name} value={mode} checked={value === mode} onChange={() => onChange(mode)} className="focus-ring size-5 cursor-[inherit] accent-[#262626]" />
              </span>
              <span className={`${campaignType.body} text-[#767676]`}>{copy}</span>
              <span className={`${campaignType.label} mt-auto`}>
                {reserved ? "Reserved price" : sponsorPriceLabel(currency)}
                {mode === "subscription" ? <span className="font-normal text-[#767676]"> / month</span> : null}
              </span>
            </span>
            <span className={`${campaignType.body} grid grid-cols-2 gap-3 bg-[#fafafa] px-5 py-3`}>
              <span><span className={`${campaignType.caption} mb-1 block text-[#767676]`}>{mode === "subscription" ? "Renews" : "Duration"}</span>{mode === "subscription" ? "Monthly" : "1 calendar month"}</span>
              <span><span className={`${campaignType.caption} mb-1 block text-[#767676]`}>{mode === "subscription" ? "Cancel" : "Renews"}</span>{mode === "subscription" ? "Anytime" : "Never"}</span>
            </span>
          </label>
        ))}
      </div>
      <p className={`${campaignType.caption} text-[#767676]`}>{reserved ? "Confirm your reserved total at checkout." : "Before applicable tax."}</p>
    </fieldset>
  );
}
