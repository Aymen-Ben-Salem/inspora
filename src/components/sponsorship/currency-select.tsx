import type { SponsorCurrency } from "@/features/sponsorship/pricing";
import { campaignType } from "./campaign-typography";

export function SponsorCurrencySelect({ value, onChange, disabled = false }: {
  value: SponsorCurrency;
  onChange: (currency: SponsorCurrency) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${campaignType.caption} flex flex-wrap items-center gap-3 text-[#767676]`}>
      Currency
      <select value={value} disabled={disabled} onChange={event => onChange(event.target.value as SponsorCurrency)} className={`${campaignType.body} focus-ring min-h-11 cursor-pointer rounded-md border border-[#e6e6e6] bg-white px-3 text-[#262626] disabled:cursor-not-allowed disabled:opacity-40`}>
        <option value="eur" aria-label="Euro">€</option>
        <option value="usd" aria-label="US dollar">$</option>
      </select>
    </label>
  );
}
