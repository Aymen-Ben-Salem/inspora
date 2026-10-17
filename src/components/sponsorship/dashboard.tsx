"use client";
import { sponsorButton } from "./button-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { PurchaseOptions } from "./purchase-options";
import { CampaignsPanel } from "./campaign-list";
import { AnalyticsOverview } from "./analytics-overview";
import {
  isSponsorBillingMode,
  type SponsorBillingMode,
} from "@/features/sponsorship/purchase-mode";
import type { readOwnSponsorDashboard } from "@/features/sponsorship/billing-service";
export type SponsorDashboardData = NonNullable<
  Awaited<ReturnType<typeof readOwnSponsorDashboard>>
>;
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " UTC"
    : "—";
}

const sections = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "billing", label: "Billing" },
] as const;
export function SponsorDashboard({
  initial,
  initialMode = "one_time",
}: {
  initial: SponsorDashboardData;
  initialMode?: SponsorBillingMode;
}) {
  const params = useSearchParams();
  const queryMode = params.get("billing");
  const choice = isSponsorBillingMode(queryMode) ? queryMode : initialMode;
  function setChoice(mode: SponsorBillingMode) {
    const url = new URL(window.location.href);
    url.searchParams.set("billing", mode);
    // Next integrates native history updates with useSearchParams, without a
    // new server request for this local review choice.
    window.history.replaceState(null, "", url);
  }
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(true),
    [message, setMessage] = useState("");
  const refreshRequest = useRef<AbortController | null>(null);
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    setData(initial);
  }
  const billingMode =
    data.checkout?.state === "reserved" ? data.checkout.billingMode : choice;
  const refresh = useCallback(async () => {
    if (refreshRequest.current) return;
    const controller = new AbortController();
    refreshRequest.current = controller;
    setRefreshing(true);
    setMessage("");
    try {
      const r = await fetch("/api/sponsorship/dashboard", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok || !body.ok)
        throw new Error(body.message ?? "Sponsorship unavailable.");
      setData(body.value);
      setMessage("Billing updated.");
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          "Your latest billing state could not be loaded. Try refreshing.",
        );
    } finally {
      if (refreshRequest.current === controller) {
        refreshRequest.current = null;
        setRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    // A prefetched or restored route can predate the campaign's latest save.
    // Activation must reset loading as well as synchronize with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      refreshRequest.current?.abort();
      refreshRequest.current = null;
    };
  }, [refresh]);
  const finishing =
    data.checkout?.paymentReceived &&
    data.checkout.exceptionCode === "activation_pending";
  useEffect(() => {
    if (data.checkout?.state !== "reserved" && !finishing) return;
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [data.checkout?.state, finishing, refresh]);
  async function open(kind: "checkout" | "portal") {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/sponsorship/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "checkout"
            ? { checkoutId: data.checkout?.id, billingMode }
            : {},
        ),
      });
      const result = await r.json();
      if (!r.ok || !result.ok)
        throw new Error(result.message ?? "Billing unavailable. Try again.");
      window.location.assign(result.value.url);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Billing unavailable. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const account = data.account;
  const readonly = account?.state === "inactive";
  const requestedSection = params.get("section");
  const section = sections.find(item => item.id === requestedSection)?.id ??
    (account ? "overview" : "billing");
  function changeSection(id: typeof sections[number]["id"]) {
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState(null, "", url);
  }
  return (
    <main className="archive-frame grid min-h-[80dvh] items-start gap-6 pb-16 pt-6 text-[#262626] lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-8">
      <aside className="min-w-0 lg:min-h-[calc(100dvh-140px)] lg:self-stretch lg:border-r lg:border-[#f0f0f0] lg:pr-5">
        <div className="lg:sticky lg:top-28">
        <p className="mb-5 text-base font-medium tracking-[-0.02em]">Your sponsorship</p>
        <nav aria-label="Sponsorship sections" className="flex gap-1 lg:flex-col">
          {sections.map(item => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              aria-controls={item.id}
              onClick={() => changeSection(item.id)}
              className={`focus-ring inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm transition-colors lg:flex-none lg:justify-start ${section === item.id ? "bg-[#f0f0f0] font-medium text-[#262626]" : "text-[#767676] hover:bg-[#fafafa] hover:text-[#262626]"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {section === "overview" && account ? (
          <nav aria-label="On this report" className="mt-10 hidden border-t border-[#f0f0f0] pt-5 lg:block">
            <p className="mb-2 px-3 text-xs text-[#767676]">On this report</p>
            {[["performance", "Performance"], ["reach-video", "Reach, cost & video"], ["audience", "Audience & delivery"]].map(([id, label]) => (
              <a key={id} href={`#report-${id}`} className="focus-ring flex min-h-11 items-center rounded-md px-3 text-xs text-[#767676] transition-colors hover:bg-[#fafafa] hover:text-[#262626]">{label}</a>
            ))}
          </nav>
        ) : null}
        </div>
      </aside>
      <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium leading-[1.2] tracking-[-0.02em]">
            {sections.find(item => item.id === section)?.label}
          </h1>
        </div>
        <button
          type="button"
          hidden={section !== "billing"}
          className={`${sponsorButton.secondary} ${section === "billing" ? "inline-flex" : "hidden"} items-center gap-2`}
          disabled={busy || refreshing}
          aria-busy={refreshing}
          onClick={() => {
            void refresh();
          }}
        >
          {refreshing ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-4 animate-spin motion-reduce:animate-none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm leading-6 text-[#767676]"
      >
        {data.checkout?.exceptionCode === "payment_dispute"
          ? "A payment dispute has paused this sponsorship. Review the payment in Billing."
          : finishing
          ? "Payment received. Finishing publication — we’ll retry automatically."
          : data.checkout?.state === "reserved" && !account
            ? "Waiting for verified payment. Returning from checkout does not activate sponsorship."
            : readonly
              ? "Your paid period has ended. Campaign and billing history are read-only."
              : account?.state === "recovery"
                ? "Your paid period has ended. Promotion is paused while payment recovers."
                : account
                  ? section === "campaigns" ? "Your campaigns, from first draft to publication." : "Your delivery, audience and billing."
                  : "Your preparation is private until payment is verified."}
      </p>
      <div className="mt-6">
        <div className="min-w-0">
          <section id="overview" aria-label="Overview" hidden={section !== "overview"}>
            <h2 className="sr-only">Overview</h2>
            {account ? <AnalyticsOverview key={data.ownerUserId} /> : (
              <div className="mt-5 rounded-md border border-[#e6e6e6] p-6">
                <p className="text-sm text-[#767676]">Performance appears after verified payment. Your campaign preparation stays private.</p>
                <button type="button" onClick={() => changeSection("billing")} className={`${sponsorButton.secondary} mt-5 cursor-pointer`}>Review payment</button>
              </div>
            )}
          </section>
        <section id="campaigns" aria-label="Campaigns" hidden={section !== "campaigns"}>
          {account ? section === "campaigns" && <CampaignsPanel key={data.ownerUserId} ownerUserId={data.ownerUserId} readonly={readonly} paused={account.state !== "active"} /> : (
            <div className="rounded-md border border-[#f0f0f0] p-6">
              <h2 className="text-lg font-medium">{data.campaigns.length ? "Your prepared campaigns" : "Your first campaign"}</h2>
              <p className="mt-3 text-sm text-[#767676]">{finishing ? "Publication is being completed." : "No public campaign yet. Your preparation stays private until payment is verified."}</p>
              {data.campaigns.length > 0 && <ul className="mt-5 divide-y divide-[#f0f0f0] border-t border-[#f0f0f0]">
                {data.campaigns.map(c => <li key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0"><h3 className="break-words text-sm font-medium">{c.title}</h3><p className="mt-1 break-all text-xs text-[#767676]">{c.url}</p></div>
                  <span className="rounded bg-[#fafafa] px-2 py-1 text-xs text-[#767676]">{c.state === "archived" ? "Previous" : "Private preparation"}</span>
                </li>)}
              </ul>}
              {data.checkout?.state !== "reserved" && <Link href={"/sponsor/start" as Route} className={`${sponsorButton.secondary} mt-6 inline-flex items-center`}>Prepare campaign</Link>}
            </div>
          )}
        </section>
        <section
          id="billing"
          aria-label="Billing"
          hidden={section !== "billing"}
          className="max-w-[760px] scroll-mt-8 py-2"
        >
          <h2 className="text-lg font-medium">Billing</h2>
          <p className="mt-2 text-sm text-[#767676]">
            {account
              ? `Billed in ${account.billingCurrency === "eur" ? "€" : account.billingCurrency === "usd" ? "$" : account.billingCurrency.toUpperCase()} · ${account.billingMode === "one_time" ? "one calendar month, paid once" : account.billingInterval === "month" ? "monthly" : "every 30 days"}. View your exact charges in Manage billing.`
              : "Choose how you’d like to pay."}
          </p>
          {account ? (
            <>
              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm">
                <dt className="text-[#767676]">Status</dt>
                <dd className="capitalize">{account.state}</dd>
                <dt className="text-[#767676]">Paid through</dt>
                <dd>{date(account.paidThrough)}</dd>
                <dt className="text-[#767676]">
                  {account.billingMode === "one_time"
                    ? "End date"
                    : account.cancelAtPeriodEnd
                      ? "Cancellation"
                      : "Renewal"}
                </dt>
                <dd>
                  {account.billingMode === "one_time"
                    ? `Ends ${date(account.paidThrough)}`
                    : account.cancelAtPeriodEnd
                      ? `Ends ${date(account.paidThrough)}`
                      : account.state === "inactive"
                        ? "Stopped"
                        : date(account.paidThrough)}
                </dd>
                {account.recoveryDeadline ? (
                  <>
                    <dt className="text-[#767676]">Recovery deadline</dt>
                    <dd>{date(account.recoveryDeadline)}</dd>
                  </>
                ) : null}
              </dl>
              <button
                className={`${sponsorButton.primary} mt-8`}
                type="button"
                disabled={busy || refreshing || !account.billingAvailable}
                onClick={() => {
                  void open("portal");
                }}
              >
                Manage billing
              </button>
              <p className="mt-4 text-sm leading-6 text-[#767676]">
                {account.billingMode === "one_time"
                  ? "View your invoice in Billing. Your sponsorship ends at the end of the paid calendar month, with no automatic renewal."
                  : "View invoices, update your payment method or cancel future renewal. Cancellation preserves your paid period. A failed renewal pauses promotion at expiry and holds your seat for 72 hours."}
              </p>
            </>
          ) : (
            <>
              <div className="mt-6">
                <PurchaseOptions
                  value={billingMode}
                  reserved={data.checkout?.state === "reserved"}
                  onChange={setChoice}
                  disabled={
                    busy || refreshing || data.checkout?.state === "reserved"
                  }
                />
              </div>
              {data.checkout?.state === "reserved" ? (
                <p className="mt-3 text-xs text-[#767676]">
                  This checkout’s payment choice is reserved. Finish it or wait
                  for it to expire before changing terms.
                </p>
              ) : null}
              <button
                className={`${sponsorButton.primary} mt-8`}
                type="button"
                disabled={
                  busy ||
                  refreshing ||
                  !data.checkoutEnabled ||
                  !data.capacityAvailable ||
                  !data.checkout ||
                  !["ready", "reserved"].includes(data.checkout.state)
                }
                onClick={() => {
                  void open("checkout");
                }}
              >
                Continue to test checkout
              </button>
              <p className="mt-4 text-sm leading-6 text-[#767676]">
                {!data.checkoutEnabled
                  ? "Test checkout is not configured yet. Your saved preparation remains private."
                  : !data.capacityAvailable
                    ? "All four seats are occupied or reserved. Your preparation remains private; refresh to check availability."
                    : "Checkout reserves an available seat for 30 minutes. Only verified payment creates your paid account."}
              </p>
            </>
          )}
          {data.checkout?.exceptionCode === "late_payment_refund_review" ? (
            <p className="mt-4 text-sm text-[#b42318]">
              A payment needs administrator resolution. It has not restored
              access or taken a seat.
            </p>
          ) : null}
        </section>
        </div>
      </div>
      {message ? (
        <p role="alert" className="mt-6 text-sm text-[#b42318]">
          {message}
        </p>
      ) : null}
      </div>
    </main>
  );
}
