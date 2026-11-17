"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sponsorButton } from "@/components/sponsorship/button-styles";
import { AUTO_RECHARGE, PRO_PACK, PRO_PLAN, formatUsd } from "@/features/pro/config";
import { PersonalAccountDeletion } from "./account-deletion";

export type ProAccountView = {
  active: boolean;
  reason: string | null;
  closed: boolean;
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  includedResetsAt: string | null;
  balances: { included: number; purchased: number; available: number };
  autoRecharge: { enabled: boolean; capCents: number | null; spentCents: number; notice: string | null; consentForCurrent: boolean };
  usage: { id: string; credits: number; at: string | null; results: number }[];
  purchases: { id: string; kind: string; state: string; credits: number; chargedCents: number | null; refundedCents: number; at: string }[];
  checkout: string | null;
};

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso)) : "—");
const notices: Record<string, string> = {
  cap_insufficient: "Your monthly automatic top-up limit cannot fund another full pack including tax. No top-up was charged. Raise the limit or buy credits manually.",
  payment_failed: "The last automatic top-up payment failed. No credits were added and nothing is owed. Update your payment method, then try again.",
  payment_method_missing: "No reusable payment method is saved for automatic top-ups. Add one in payment settings.",
};
const checkoutMessages: Record<string, string> = {
  subscribed: "Thanks. Pro activates as soon as your payment is confirmed, usually within a minute.",
  pack: "Thanks. Credits are added as soon as your payment is confirmed.",
  canceled: "Checkout was canceled. Nothing was charged.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#e6e6e6] py-8">
      <h2 className="text-lg">{title}</h2>
      <div className="mt-4 text-sm text-[#404040]">{children}</div>
    </section>
  );
}

export function ProAccountPanel({ view }: { view: ProAccountView }) {
  const { refresh } = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState<number>(view.autoRecharge.capCents ?? AUTO_RECHARGE.suggestedCapCents);
  const [acknowledged, setAcknowledged] = useState(false);
  const awaitingSubscription = view.checkout === "subscribed" && !view.active && !view.closed && view.reason !== "payment_review";

  useEffect(() => {
    if (!awaitingSubscription) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      refresh();
      if (++attempts >= 20) window.clearInterval(timer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [awaitingSubscription, refresh]);

  async function act(action: string, body?: unknown) {
    setBusy(action); setError(null);
    try {
      const response = await fetch(`/api/account/pro/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.message ?? "Something went wrong. Try again."); return; }
      if (data.url) { window.location.assign(data.url); return; }
      refresh();
    } catch {
      setError("Billing is temporarily unavailable. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const status = view.closed ? "Closed" : view.active ? (view.cancelAtPeriodEnd ? `Active until ${day(view.paidThrough)}, renewal canceled` : `Active, renews ${day(view.paidThrough)}`)
    : view.reason === "payment_review" ? "Paused while a payment is reviewed" : "Not subscribed";
  const capRemaining = view.autoRecharge.capCents === null ? null : Math.max(0, view.autoRecharge.capCents - view.autoRecharge.spentCents);

  return (
    <main className="mx-auto max-w-[880px] px-4 py-12">
      <h1 className="text-3xl">Inspora Pro</h1>
      <p className="mt-3 text-sm text-[#767676]">Your personal plan for Inspora features, starting with the Inspora MCP for Claude Code and Codex.</p>
      {view.checkout && checkoutMessages[view.checkout] ? <p role="status" className="mt-6 rounded-md border border-[#e6e6e6] p-3 text-sm">{checkoutMessages[view.checkout]}</p> : null}
      {awaitingSubscription ? <button className={`${sponsorButton.secondary} mt-3`} onClick={() => refresh()}>Refresh payment status</button> : null}
      {error ? <p role="alert" className="mt-6 rounded-md border border-[#d33] p-3 text-sm text-[#a11]">{error}</p> : null}

      <Section title="Plan">
        <p className="text-base text-[#262626]">{status}</p>
        {view.reason === "payment_review" ? <p className="mt-2">A bank dispute is open on one of your payments. Your balances and history are kept, and access returns once a valid payment is confirmed.</p> : null}
        <p className="mt-3">{PRO_PLAN.name}: {formatUsd(PRO_PLAN.baseAmountCents)} per month plus any applicable tax, with {PRO_PLAN.includedCredits.toLocaleString("en")} search credits each paid month. The full total is shown at checkout before you pay.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!view.active && !view.closed && view.reason !== "payment_review" ? <button className={sponsorButton.primary} disabled={busy !== null} onClick={() => act("subscribe")}>Subscribe</button> : null}
          {view.active && !view.cancelAtPeriodEnd ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("cancel-renewal")}>Cancel renewal</button> : null}
          {view.active && view.cancelAtPeriodEnd ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("resume-renewal")}>Resume renewal</button> : null}
          {view.hasCustomer && !view.closed ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("portal")}>Payment method and invoices</button> : null}
        </div>
        {view.active ? <p className="mt-3 text-[#767676]">If you cancel, Pro stays active until the end of the paid month. Purchased credits are kept and become usable again if you resubscribe.</p> : null}
      </Section>

      <Section title="Credits">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><dt className="text-[#767676]">Available</dt><dd className="text-2xl text-[#262626]">{view.balances.available.toLocaleString("en")}</dd></div>
          <div><dt className="text-[#767676]">Monthly</dt><dd className="text-2xl text-[#262626]">{view.balances.included.toLocaleString("en")}</dd><dd className="text-xs text-[#767676]">Resets to {PRO_PLAN.includedCredits.toLocaleString("en")} on each paid renewal{view.includedResetsAt ? ` (next ${day(view.includedResetsAt)})` : ""}. Unused monthly credits do not roll over.</dd></div>
          <div><dt className="text-[#767676]">Purchased</dt><dd className="text-2xl text-[#262626]">{view.balances.purchased.toLocaleString("en")}</dd><dd className="text-xs text-[#767676]">No scheduled expiry while your account stays open. Used after monthly credits.</dd></div>
        </dl>
        <p className="mt-4">One credit is used for each new search that returns at least one work. More results pages, work details, previews, status checks, empty results and service errors are free. A retried request is never charged twice.</p>
        {view.active ? (
          <div className="mt-4">
            <button className={sponsorButton.primary} disabled={busy !== null} onClick={() => act("pack")}>Buy {PRO_PACK.credits} credits, {formatUsd(PRO_PACK.baseAmountCents)} plus any tax</button>
          </div>
        ) : <p className="mt-4 text-[#767676]">An active Pro subscription is needed to buy or use extra credits.</p>}
      </Section>

      <Section title="Automatic top-up">
        {view.autoRecharge.notice && notices[view.autoRecharge.notice] ? <p role="status" className="mb-4 rounded-md border border-[#e6e6e6] p-3">{notices[view.autoRecharge.notice]}</p> : null}
        <p>When enabled, one pack of {PRO_PACK.credits} credits ({formatUsd(PRO_PACK.baseAmountCents)} plus any tax) is charged to your saved payment method only when you start a new search with fewer than {AUTO_RECHARGE.thresholdCredits} credits left. Turning it on, idle time, status checks and work details never trigger a purchase. Credits are added only after the payment succeeds.</p>
        <p className="mt-2">Automatic purchases stop at your monthly limit, counted per billing month using the full charged amount including tax. A pack is only bought if its full price fits the remaining limit. You can turn this off at any time.</p>
        {view.autoRecharge.enabled && view.autoRecharge.consentForCurrent ? (
          <div className="mt-4">
            <p className="text-[#262626]">On, limit {formatUsd(view.autoRecharge.capCents ?? 0)} per billing month. Used this month: {formatUsd(view.autoRecharge.spentCents)}{capRemaining !== null ? `, remaining ${formatUsd(capRemaining)}` : ""}.</p>
            <button className={`${sponsorButton.secondary} mt-3`} disabled={busy !== null} onClick={() => act("recharge", { enabled: false })}>Turn off automatic top-up</button>
          </div>
        ) : view.active ? (
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void act("recharge", { enabled: true, capCents: cap, acknowledged: true }); }}>
            <label className="block">Monthly limit{" "}
              <select className="ml-2 rounded-md border border-[#e6e6e6] px-2 py-1" value={cap} onChange={(event) => setCap(Number(event.target.value))}>
                {AUTO_RECHARGE.capOptionsCents.map((value) => <option key={value} value={value}>{formatUsd(value)}{value === AUTO_RECHARGE.suggestedCapCents ? " (suggested)" : ""}</option>)}
              </select>
            </label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /><span>I agree that Inspora may charge my saved payment method for one {PRO_PACK.credits}-credit pack, including any tax, each time a new search starts below {AUTO_RECHARGE.thresholdCredits} credits, up to my monthly limit.</span></label>
            <button type="submit" className={sponsorButton.primary} disabled={busy !== null || !acknowledged}>Turn on automatic top-up</button>
          </form>
        ) : <p className="mt-4 text-[#767676]">Available with an active Pro subscription.</p>}
      </Section>

      <Section title="Recent credit use">
        {view.usage.length ? (
          <ul className="divide-y divide-[#f0f0f0]">{view.usage.map((u) => <li key={u.id} className="flex justify-between py-2"><span>MCP search, {u.results} {u.results === 1 ? "work" : "works"} returned</span><span className="text-[#767676]">{u.credits} credit · {day(u.at)}</span></li>)}</ul>
        ) : <p className="text-[#767676]">No credits used yet.</p>}
      </Section>

      <Section title="Credit purchases">
        {view.purchases.length ? (
          <ul className="divide-y divide-[#f0f0f0]">{view.purchases.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.kind === "automatic" ? "Automatic top-up" : "Credit pack"}, {p.credits} credits, {p.state.replace("_", " ")}</span><span className="text-[#767676]">{p.chargedCents ? formatUsd(p.chargedCents) : "—"}{p.refundedCents ? `, refunded ${formatUsd(p.refundedCents)}` : ""} · {day(p.at)}</span></li>)}</ul>
        ) : <p className="text-[#767676]">No credit purchases yet.</p>}
      </Section>

      <Section title="Refunds and account deletion">
        <p>Unused purchased credits are not exchanged for cash, and partial months are not refunded automatically. Billing errors, service problems and refunds required by law are handled on request.</p>
        {!view.closed ? <div className="mt-4"><PersonalAccountDeletion credits={view.balances.included + view.balances.purchased} purchasedCredits={view.balances.purchased} /></div> : null}
      </Section>
    </main>
  );
}
