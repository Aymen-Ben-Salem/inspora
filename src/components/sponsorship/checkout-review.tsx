import { campaignType } from "./campaign-typography";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";
import { sponsorButton } from "./button-styles";
import { SponsorSpinner } from "./sponsor-loading";
import { sponsorPriceLabel, type SponsorCurrency } from "@/features/sponsorship/pricing";
import { SponsorCurrencySelect } from "./currency-select";

export function CheckoutReview({ billingMode, disabled, busy, currency, onCurrencyChange }: {
  billingMode: SponsorBillingMode;
  disabled: boolean;
  busy: boolean;
  currency: SponsorCurrency;
  onCurrencyChange: (currency: SponsorCurrency) => void;
}) {
  return (
    <section aria-labelledby="checkout-review-title" className="space-y-5 border-t border-[#e6e6e6] pt-8">
      <div>
        <h2 id="checkout-review-title" className={campaignType.heading}>Review</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-[#e6e6e6]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className={campaignType.label}>Website sponsorship</p>
            <p className={`${campaignType.body} mt-1 text-[#767676]`}>{billingMode === "subscription" ? "Subscribe · Monthly" : "One-off · 1 calendar month"}</p>
          </div>
          <p className={campaignType.label}>{sponsorPriceLabel(currency)}</p>
        </div>
        <dl className="border-t border-[#e6e6e6] bg-[#fafafa] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <dt className={campaignType.label}>Due today <span className="font-normal text-[#767676]">before tax</span></dt>
            <dd className={campaignType.label}>{sponsorPriceLabel(currency)}</dd>
          </div>
        </dl>
        <p className={`${campaignType.caption} border-t border-[#e6e6e6] px-5 py-4 text-[#767676]`}>
          Navbar · Feed · Sidebar
        </p>
      </div>
      <SponsorCurrencySelect value={currency} onChange={onCurrencyChange} disabled={disabled} />
      <p className={`${campaignType.body} pt-3 text-[#767676]`}>Manage your campaign from your dashboard after checkout.</p>
      <button type="submit" name="action" value="checkout" disabled={disabled} aria-busy={busy} className={`${sponsorButton.primary} gap-2`}>
        {busy ? <SponsorSpinner className="size-4" /> : null}
        {busy ? "Opening checkout…" : "Checkout"}
      </button>
    </section>
  );
}
