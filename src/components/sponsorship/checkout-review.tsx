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
        <h2 id="checkout-review-title" className="text-lg font-medium">Review</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-[#e6e6e6]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Website sponsorship</p>
            <p className="mt-1 text-sm text-[#767676]">{billingMode === "subscription" ? "Subscribe · Monthly" : "One-off · 1 calendar month"}</p>
          </div>
          <p className="text-sm font-medium">$500 / €450</p>
        </div>
        <dl className="border-t border-[#e6e6e6] bg-[#fafafa] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <dt className="text-sm font-medium">Due today <span className="font-normal text-[#767676]">before tax</span></dt>
            <dd className="text-base font-medium tracking-[-0.02em]">$500 / €450</dd>
          </div>
        </dl>
        <p className="border-t border-[#e6e6e6] px-5 py-4 text-xs leading-5 text-[#767676]">
          Navbar · Feed · Sidebar
        </p>
      </div>
      <p className="pt-3 text-sm leading-6 text-[#767676]">Manage your campaign from your dashboard after checkout.</p>
      <button type="submit" name="action" value="checkout" disabled={disabled} aria-busy={busy} className={`${sponsorButton.primary} gap-2`}>
        {busy ? <SponsorSpinner className="size-4" /> : null}
        {busy ? "Opening checkout…" : "Checkout"}
      </button>
    </section>
  );
}
