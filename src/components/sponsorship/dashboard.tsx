"use client";
import { sponsorButton } from "./button-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { PurchaseOptions } from "./purchase-options";
import { SponsorCurrencySelect } from "./currency-select";
import { SPONSOR_AMOUNTS, isSponsorCurrency, type SponsorCurrency } from "@/features/sponsorship/pricing";
import { CampaignsPanel } from "./campaign-list";
import { AnalyticsOverview } from "./analytics-overview";
import { DashboardIcon } from "./dashboard-icon";
import styles from "./dashboard.module.css";
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

function BillingDate({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  const [day, time] = date(value).split(", ");
  return <time dateTime={value}>{day}<span className={`mt-1 block text-xs font-normal tracking-normal ${styles.muted}`}> {time}</span></time>;
}

const sections = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "billing", label: "Billing" },
] as const;
export function SponsorDashboard({
  initial,
  initialMode = "one_time",
  initialCurrency = "usd",
}: {
  initial: SponsorDashboardData;
  initialMode?: SponsorBillingMode;
  initialCurrency?: SponsorCurrency;
}) {
  const params = useSearchParams();
  const [currencyChoice, setCurrencyChoice] = useState(initialCurrency);
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
  const [reviewMonthly, setReviewMonthly] = useState(false);
  const refreshRequest = useRef<AbortController | null>(null);
  const openRequest = useRef(false);
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    setData(initial);
  }
  const billingMode =
    data.checkout?.state === "reserved" ? data.checkout.billingMode : choice;
  const currency = data.checkout?.state === "reserved" && data.checkout.currency ? data.checkout.currency : currencyChoice;
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
  async function open(kind: "checkout" | "portal" | "monthly") {
    if (openRequest.current) return;
    openRequest.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/sponsorship/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "checkout"
            ? { checkoutId: data.checkout?.id, billingMode, currency }
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
      openRequest.current = false;
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
    <main className={`${styles.shell} archive-frame grid min-h-[80dvh] items-start gap-6 pb-16 pt-8 lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-8`}>
      <aside className="min-w-0 lg:min-h-[calc(100dvh-140px)] lg:self-stretch lg:border-r lg:border-[#f0f0f0] lg:pr-5">
        <div className="lg:sticky lg:top-28">
        <p className={styles.sidebarTitle}><span className={styles.brandMark}><DashboardIcon name="chart" className="size-5" /></span>Your sponsorship</p>
        <nav aria-label="Sponsorship sections" className="flex gap-1 lg:flex-col">
          {sections.map(item => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              aria-controls={item.id}
              onClick={() => changeSection(item.id)}
              className={`${styles.navItem} focus-ring inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors lg:flex-none lg:justify-start ${section === item.id ? "font-medium" : "text-[#66758c] hover:bg-[#f3f6fc] hover:text-[#262626]"}`}
            >
              <DashboardIcon name={item.id} />
              {item.label}
            </button>
          ))}
        </nav>
        {section === "overview" && account ? (
          <nav aria-label="On this report" className="mt-10 hidden border-t border-[#f0f0f0] pt-5 lg:block">
            <p className="mb-2 px-3 text-xs text-[#66758c]">On this report</p>
            {[["performance", "Performance"], ["reach-video", "Reach, cost & video"], ["audience", "Audience & delivery"]].map(([id, label]) => (
              <a key={id} href={`#report-${id}`} className="focus-ring flex min-h-11 items-center rounded-md px-3 text-xs text-[#66758c] transition-colors hover:bg-[#fafafa] hover:text-[#262626]">{label}</a>
            ))}
          </nav>
        ) : null}
        </div>
      </aside>
      <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={styles.heading}>
            {sections.find(item => item.id === section)?.label}
          </h1>
        </div>
        <button
          type="button"
          hidden={section !== "billing"}
          className={`${sponsorButton.secondary} ${styles.secondaryButton} ${section === "billing" ? "inline-flex" : "hidden"} items-center gap-2`}
          disabled={busy || refreshing}
          aria-busy={refreshing}
          onClick={() => {
            void refresh();
          }}
        >
          {refreshing ? (
            <DashboardIcon name="loading" className="size-4 animate-spin motion-reduce:animate-none" />
          ) : null}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm leading-6 text-[#66758c]"
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
                  ? section === "campaigns" ? "Your campaigns, from first draft to publication." : section === "billing" ? "Your plan, payment details and renewal." : "Your delivery, audience and billing."
                  : "Your preparation is private until payment is verified."}
      </p>
      <div className="mt-6">
        <div className="min-w-0">
          <section id="overview" aria-label="Overview" hidden={section !== "overview"}>
            <h2 className="sr-only">Overview</h2>
            {account ? <AnalyticsOverview key={data.ownerUserId} /> : (
              <div className={`${styles.empty} mt-5`}>
                <p className="text-sm text-[#66758c]">Performance appears after verified payment. Your campaign preparation stays private.</p>
                <button type="button" onClick={() => changeSection("billing")} className={`${sponsorButton.secondary} ${styles.secondaryButton} mt-5 cursor-pointer`}>Review payment</button>
              </div>
            )}
          </section>
        <section id="campaigns" aria-label="Campaigns" hidden={section !== "campaigns"}>
          {account ? <CampaignsPanel key={data.ownerUserId} ownerUserId={data.ownerUserId} active={section === "campaigns"} readonly={readonly} paused={account.state !== "active"} /> : (
            <div className={styles.surface}>
              <h2 className="text-lg font-medium">{data.campaigns.length ? "Your prepared campaigns" : "Your first campaign"}</h2>
              <p className="mt-3 text-sm text-[#66758c]">{finishing ? "Publication is being completed." : "No public campaign yet. Your preparation stays private until payment is verified."}</p>
              {data.campaigns.length > 0 && <ul className="mt-5 divide-y divide-[#f0f0f0] border-t border-[#f0f0f0]">
                {data.campaigns.map(c => <li key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0"><h3 className="break-words text-sm font-medium">{c.title}</h3><p className="mt-1 break-all text-xs text-[#66758c]">{c.url}</p></div>
                  <span className={styles.statusBadge}>{c.state === "archived" ? "Previous" : "Private preparation"}</span>
                </li>)}
              </ul>}
              {data.checkout?.state !== "reserved" && <Link href={"/sponsor/start" as Route} className={`${sponsorButton.primary} ${styles.primaryButton} mt-6 inline-flex items-center`}><DashboardIcon name="plus" />Prepare campaign</Link>}
            </div>
          )}
        </section>
        <section
          id="billing"
          aria-label="Billing"
          hidden={section !== "billing"}
          className="scroll-mt-8 space-y-6"
        >
          <p className={`text-sm leading-6 ${styles.muted}`}>
            {account
              ? `Billed in ${account.billingCurrency === "eur" ? "€" : account.billingCurrency === "usd" ? "$" : account.billingCurrency.toUpperCase()} · ${account.billingMode === "one_time" ? "one calendar month, paid once" : account.billingInterval === "month" ? "monthly" : "every 30 days"}. View your exact charges in Manage billing.`
              : "Choose how you’d like to pay."}
          </p>
          {account ? (
            <>
              <dl className={styles.billingSummary}>
                <div className={styles.metric}>
                <dt className={styles.metricHeader}>Subscription<span className={styles.metricIcon}><DashboardIcon name="calendar" /></span></dt>
                <dd className="mt-4">
                  <dl className={styles.billingPeriod}>
                    <div><dt>Start date</dt><dd><BillingDate value={account.periodStart} /></dd></div>
                    <div><dt>End date</dt><dd><BillingDate value={account.paidThrough} /></dd></div>
                  </dl>
                </dd>
                <dd className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 ${styles.muted}`}><span className={styles.statusBadge} data-active={account.state === "active"}><span className="capitalize">{account.state}</span> · {account.billingMode === "one_time" ? "One-time payment" : "Monthly"}</span><span>{account.cancelAtPeriodEnd && account.billingMode !== "one_time" ? "Cancellation scheduled · No automatic renewal" : account.billingMode === "one_time" || account.state === "inactive" ? "No automatic renewal" : account.billingInterval === "month" ? "Renews monthly" : "Renews every 30 days"}</span></dd>
                </div>
              </dl>
              {account.recoveryDeadline ? <div className={styles.notice}><p className="text-sm font-medium">Recovery deadline</p><p className={`mt-1 text-sm ${styles.muted}`}>{date(account.recoveryDeadline)}</p></div> : null}
              {account.monthlyStartsAt && !account.cancelAtPeriodEnd ? <div className={styles.notice}><p className="text-sm font-medium">Monthly billing scheduled</p><p className={`mt-1 text-sm leading-6 ${styles.muted}`}>Your first monthly charge is on {date(account.monthlyStartsAt)}. Your current paid period stays covered. You can cancel future renewal in Manage billing.</p></div> : null}
              <section className={`${styles.surface} ${styles.billingDetails}`} aria-labelledby="payment-details-title">
                <div>
                  <h2 id="payment-details-title" className="flex items-center gap-3 text-lg font-medium"><span className={styles.metricIcon}><DashboardIcon name="receipt" /></span>Payment details</h2>
                  <p className={`mt-4 max-w-2xl text-sm leading-6 ${styles.muted}`}>
                    {account.billingMode === "one_time"
                      ? "View your invoice in Billing. Your sponsorship ends at the end of the paid calendar month, with no automatic renewal."
                      : "View invoices, update your payment method or cancel future renewal. Cancellation preserves your paid period. A failed renewal pauses promotion at expiry and holds your seat for 72 hours."}
                  </p>
                </div>
              <button
                className={`${sponsorButton.primary} ${styles.primaryButton} shrink-0`}
                type="button"
                disabled={busy || refreshing || !account.billingAvailable}
                onClick={() => {
                  void open("portal");
                }}
              >
                Manage billing<DashboardIcon name="external" />
              </button>
              </section>
              {account.billingMode === "one_time" && account.state === "active" && <section className={`${styles.surface} ${styles.billingDetails}`} aria-labelledby="monthly-plan-title">
                <div>
                  <h2 id="monthly-plan-title" className="flex items-center gap-3 text-lg font-medium"><span className={styles.metricIcon}><DashboardIcon name="renewal" /></span>Continue with monthly billing</h2>
                  <p className={`mt-4 max-w-2xl text-sm leading-6 ${styles.muted}`}>Keep your sponsorship running after this paid month. {isSponsorCurrency(account.billingCurrency) ? new Intl.NumberFormat("en-US", { style: "currency", currency: account.billingCurrency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(SPONSOR_AMOUNTS[account.billingCurrency] / 100) : "Monthly price"} per month, before applicable tax. Your first charge will be on {date(account.paidThrough)}.</p>
                  {!account.monthlyAvailable && <p className={`mt-2 text-xs leading-5 ${styles.muted}`}>Plan changes are currently unavailable. You can review monthly options once this paid period ends.</p>}
                  {reviewMonthly && account.monthlyAvailable && <div role="group" aria-label="Review monthly billing" className={`${styles.notice} mt-4`}>
                    <p className="text-sm leading-6">Your remaining paid time is included. Monthly charges start after this period ends and continue until you cancel. Review and confirm these terms in checkout.</p>
                    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || refreshing} onClick={() => void open("monthly")} className={`${sponsorButton.primary} ${styles.primaryButton}`}>{busy ? "Opening checkout…" : "Continue to monthly checkout"}<DashboardIcon name="external" /></button><button type="button" disabled={busy} onClick={() => setReviewMonthly(false)} className={`${sponsorButton.secondary} ${styles.secondaryButton}`}>Cancel</button></div>
                  </div>}
                </div>
                {!reviewMonthly && <button type="button" disabled={busy || refreshing || !account.monthlyAvailable} onClick={() => setReviewMonthly(true)} className={`${sponsorButton.primary} ${styles.primaryButton} shrink-0`}>{data.checkout?.monthlyRenewal && data.checkout.state === "reserved" ? "Continue monthly setup" : "Switch to monthly"}<DashboardIcon name="right" /></button>}
              </section>}
            </>
          ) : (
            <div className={`${styles.surface} ${styles.billingOptions}`}>
              <div>
                <PurchaseOptions
                  currency={currency}
                  value={billingMode}
                  reserved={data.checkout?.state === "reserved"}
                  onChange={setChoice}
                  disabled={
                    busy || refreshing || data.checkout?.state === "reserved"
                  }
                />
                {data.checkout?.state !== "reserved" ? <SponsorCurrencySelect value={currency} onChange={setCurrencyChoice} disabled={busy || refreshing} /> : null}
              </div>
              {data.checkout?.state === "reserved" ? (
                <p className="mt-3 text-xs text-[#66758c]">
                  This checkout’s payment choice is reserved. Finish it or wait
                  for it to expire before changing terms.
                </p>
              ) : null}
              <button
                className={`${sponsorButton.primary} ${styles.primaryButton} mt-8`}
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
              <p className="mt-4 text-sm leading-6 text-[#66758c]">
                {!data.checkoutEnabled
                  ? "Test checkout is not configured yet. Your saved preparation remains private."
                  : !data.capacityAvailable
                    ? "All four seats are occupied or reserved. Your preparation remains private; refresh to check availability."
                    : "Checkout reserves an available seat for 30 minutes. Only verified payment creates your paid account."}
              </p>
            </div>
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
        <p role={message === "Billing updated." ? "status" : "alert"} className={`mt-6 text-sm ${message === "Billing updated." ? "text-[#526f9c]" : "text-[#b42318]"}`}>
          {message}
        </p>
      ) : null}
      </div>
    </main>
  );
}
