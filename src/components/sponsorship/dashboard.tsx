"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
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
const button =
  "focus-ring min-h-11 rounded-md border border-[#e6e6e6] px-4 py-2 text-sm disabled:opacity-40";
export function SponsorDashboard({
  initial,
}: {
  initial: SponsorDashboardData;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [message, setMessage] = useState("");
  const refreshInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setMessage("");
    try {
      const r = await fetch("/api/sponsorship/dashboard", {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok || !body.ok)
        throw new Error(body.message ?? "Sponsorship unavailable.");
      setData(body.value);
      setMessage("Billing updated.");
    } catch {
      setMessage(
        "Your latest billing state could not be loaded. Try refreshing.",
      );
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, []);
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
          kind === "checkout" ? { checkoutId: data.checkout?.id } : {},
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
  const account = data.account,
    current = data.campaigns.find((c) => c.state === "published");
  const readonly = account?.state === "inactive";
  return (
    <main className="mx-auto min-h-[80dvh] w-full max-w-[1120px] px-4 pb-20 pt-12 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6e6e6] pb-8">
        <div>
          <p className="text-sm text-[#767676]">Inspora sponsorship</p>
          <h1 className="mt-2 text-[32px] font-medium tracking-[-0.03em]">
            Your sponsorship
          </h1>
        </div>
        <button
          type="button"
          className={`${button} inline-flex items-center gap-2 cursor-pointer transition-colors hover:border-[#cfcfcf] hover:bg-[#fafafa] active:bg-[#f0f0f0] disabled:cursor-not-allowed`}
          disabled={busy || refreshing}
          aria-busy={refreshing}
          onClick={() => {
            void refresh();
          }}
        >
          {refreshing ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-spin motion-reduce:animate-none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="opacity-25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : null}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-6 text-sm text-[#767676]"
      >
        {finishing
          ? "Payment received. Finishing publication — we’ll retry automatically."
          : data.checkout?.state === "reserved" && !account
            ? "Waiting for verified payment. Returning from checkout does not activate sponsorship."
            : readonly
              ? "Your paid period has ended. Campaign and billing history are read-only."
              : account?.state === "recovery"
                ? "Your paid period has ended. Promotion is paused while payment recovers."
                : account
                  ? "Your billing and current campaign."
                  : "Your preparation is private until payment is verified."}
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-lg border border-[#e6e6e6] p-6">
          <h2 className="text-lg font-medium">Current campaign</h2>
          {current ? (
            <>
              <p className="mt-8 text-2xl tracking-[-0.02em]">
                {current.title}
              </p>
              <a
                className="focus-ring mt-2 inline-block max-w-full break-all text-sm text-[#767676] underline"
                href={current.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {current.url}
              </a>
              <p className="mt-4 text-sm text-[#767676]">
                {account?.state === "active"
                  ? "Published through the paid period"
                  : "Promotion paused"}
              </p>
            </>
          ) : (
            <p className="mt-8 text-sm text-[#767676]">
              {finishing
                ? "Publication is being completed."
                : "No public campaign yet."}
            </p>
          )}
          {!readonly && !account && data.checkout?.state !== "reserved" ? (
            <Link
              href={"/sponsor/start" as Route}
              className={`${button} mt-8 inline-flex items-center`}
            >
              Prepare campaign
            </Link>
          ) : null}
          {data.campaigns.length ? (
            <div className="mt-8 border-t border-[#e6e6e6] pt-4">
              <h3 className="text-sm text-[#767676]">Campaign history</h3>
              <ul className="mt-3 space-y-3">
                {data.campaigns.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap justify-between gap-2 text-sm"
                  >
                    <span>{c.title}</span>
                    <span className="text-[#767676]">{c.state}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        <section
          id="billing"
          className="scroll-mt-8 rounded-lg border border-[#e6e6e6] p-6"
        >
          <h2 className="text-lg font-medium">Billing</h2>
          <p className="mt-2 text-sm text-[#767676]">
            USD 500 before applicable tax · every exact 30 days
          </p>
          {account ? (
            <>
              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm">
                <dt className="text-[#767676]">Status</dt>
                <dd className="capitalize">{account.state}</dd>
                <dt className="text-[#767676]">Paid through</dt>
                <dd>{date(account.paidThrough)}</dd>
                <dt className="text-[#767676]">
                  {account.cancelAtPeriodEnd ? "Cancellation" : "Renewal"}
                </dt>
                <dd>
                  {account.cancelAtPeriodEnd
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
                className={`${button} mt-8 bg-[#262626] text-white`}
                type="button"
                disabled={busy || refreshing || !account.billingAvailable}
                onClick={() => {
                  void open("portal");
                }}
              >
                Manage billing
              </button>
              <p className="mt-4 text-sm leading-6 text-[#767676]">
                View invoices, update your payment method or cancel future
                renewal. Cancellation preserves your paid period. A failed
                renewal pauses promotion at expiry and holds your seat for 72
                hours.
              </p>
            </>
          ) : (
            <>
              <button
                className={`${button} mt-8 bg-[#262626] text-white`}
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
      {message ? (
        <p role="alert" className="mt-6 text-sm text-[#b42318]">
          {message}
        </p>
      ) : null}
    </main>
  );
}
