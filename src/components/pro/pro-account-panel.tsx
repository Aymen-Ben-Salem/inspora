"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sponsorButton } from "@/components/sponsorship/button-styles";
import { PRO_MCP_FAIR_USE, PRO_PLAN, formatUsd } from "@/features/pro/config";
import { PersonalAccountDeletion } from "./account-deletion";

export type ProAccountView = {
  active: boolean;
  reason: string | null;
  closed: boolean;
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  subscribed: boolean;
  checkout: string | null;
};

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso)) : "—");
const checkoutMessages: Record<string, string> = {
  subscribed: "Thanks. Pro activates as soon as your payment is confirmed, usually within a minute.",
  canceled: "Checkout was canceled. Nothing was charged.",
};
const installCommands = {
  claude: "claude plugin marketplace add inspora-design/inspora-plugin\nclaude plugin install inspora@inspora-team",
  codex: "codex plugin marketplace add inspora-design/inspora-plugin\ncodex plugin add inspora@inspora-team",
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

  async function act(action: string) {
    setBusy(action); setError(null);
    try {
      const response = await fetch(`/api/account/pro/${action}`, { method: "POST" });
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

  return (
    <main className="mx-auto max-w-[880px] px-4 py-12">
      <h1 className="text-3xl">Inspora Pro</h1>
      <p className="mt-3 text-sm text-[#767676]">Your personal plan for Inspora features, starting with the Inspora plugin for Claude Code and Codex.</p>
      {view.checkout && checkoutMessages[view.checkout] ? <p role="status" className="mt-6 rounded-md border border-[#e6e6e6] p-3 text-sm">{checkoutMessages[view.checkout]}</p> : null}
      {awaitingSubscription ? <button className={`${sponsorButton.secondary} mt-3`} onClick={() => refresh()}>Refresh payment status</button> : null}
      {error ? <p role="alert" className="mt-6 rounded-md border border-[#d33] p-3 text-sm text-[#a11]">{error}</p> : null}

      <Section title="Plan">
        <p className="text-base text-[#262626]">{status}</p>
        {view.reason === "payment_review" ? <p className="mt-2">A bank dispute is open on one of your payments. Your plan and history are kept, and access returns once a valid payment is confirmed.</p> : null}
        <p className="mt-3">{PRO_PLAN.name}: {formatUsd(PRO_PLAN.baseAmountCents)} per month plus any applicable tax. The full total is shown at checkout before you pay.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!view.active && !view.closed && view.reason !== "payment_review" ? <button className={sponsorButton.primary} disabled={busy !== null} onClick={() => act("subscribe")}>Subscribe</button> : null}
          {view.active && !view.cancelAtPeriodEnd ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("cancel-renewal")}>Cancel renewal</button> : null}
          {view.active && view.cancelAtPeriodEnd ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("resume-renewal")}>Resume renewal</button> : null}
          {view.hasCustomer && !view.closed ? <button className={sponsorButton.secondary} disabled={busy !== null} onClick={() => act("portal")}>Payment method and invoices</button> : null}
        </div>
        {view.active ? <p className="mt-3 text-[#767676]">If you cancel, Pro stays active until the end of the paid month.</p> : null}
      </Section>

      <Section title="Use Inspora in Claude Code and Codex">
        <p>The Inspora plugin is included with Pro. Install it, then sign in with this Inspora account when your agent asks.</p>
        <p className="mt-3 text-[#262626]">Claude Code</p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-[#e6e6e6] bg-[#fafafa] p-3 text-xs"><code>{installCommands.claude}</code></pre>
        <p className="mt-3 text-[#262626]">Codex</p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-[#e6e6e6] bg-[#fafafa] p-3 text-xs"><code>{installCommands.codex}</code></pre>
        <p className="mt-3">Fair use applies per account, across all your connected apps: up to {PRO_MCP_FAIR_USE.toolCallsPerMinute} tool calls a minute, {PRO_MCP_FAIR_USE.toolCallsPerDay.toLocaleString("en")} a day and {PRO_MCP_FAIR_USE.searchesPerMonth.toLocaleString("en")} searches a month. If you reach a limit, your agent is told when it can try again.</p>
        {!view.active ? <p className="mt-3 text-[#767676]">The plugin works while your Pro subscription is active.</p> : null}
      </Section>

      <Section title="Refunds and account deletion">
        <p>Partial months are not refunded automatically. Billing errors, service problems and refunds required by law are handled on request.</p>
        {!view.closed ? <div className="mt-4"><PersonalAccountDeletion subscribed={view.subscribed} /></div> : null}
      </Section>
    </main>
  );
}
