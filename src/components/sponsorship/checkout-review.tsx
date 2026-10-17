import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";
import { sponsorButton } from "./button-styles";
import { SponsorSpinner } from "./sponsor-loading";

export function CheckoutReview({ billingMode, disabled, busy }: {
  billingMode: SponsorBillingMode;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <section aria-labelledby="checkout-review-title" className="space-y-5 border-t border-[#e6e6e6] pt-8">
      <div>
        <h2 id="checkout-review-title" className="text-lg font-medium">Review your sponsorship</h2>
        <p className="mt-2 text-sm leading-6 text-[#767676]">Your brand across Inspora, with all three placements included.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-[#e6e6e6]">
        <div className="space-y-3 p-5">
          <p className="text-sm font-medium">Inspora sponsorship</p>
          <p className="text-xs leading-5 text-[#767676]">Navbar icon · Feed creative · Sidebar wordmark</p>
          <p className="text-sm">{billingMode === "subscription" ? "Monthly subscription" : "One-time · One calendar month"}</p>
        </div>
        <dl className="border-t border-[#e6e6e6] bg-[#fafafa] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <dt className="text-sm font-medium">Due today <span className="font-normal text-[#767676]">before tax</span></dt>
            <dd className="text-base font-medium tracking-[-0.02em]">USD 500 / EUR 500</dd>
          </div>
        </dl>
        <p className="border-t border-[#e6e6e6] px-5 py-4 text-xs leading-5 text-[#767676]">
          {billingMode === "subscription" ? "Renews every calendar month. Cancel future renewal from your dashboard." : "A single payment. No automatic renewal."}
        </p>
      </div>
      <p className="text-sm leading-6 text-[#767676]">Checkout saves your campaign first. Confirm your currency and final total before paying, then manage your campaign from your sponsorship dashboard.</p>
      <button type="submit" name="action" value="checkout" disabled={disabled} aria-busy={busy} className={`${sponsorButton.primary} gap-2`}>
        {busy ? <SponsorSpinner className="size-4" /> : null}
        {busy ? "Opening checkout…" : "Checkout"}
      </button>
    </section>
  );
}
