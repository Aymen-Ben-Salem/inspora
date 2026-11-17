import { Suspense } from "react";
import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SiteNavbar } from "@/components/site-navbar";
import { ProAccountPanel, type ProAccountView } from "@/components/pro/pro-account-panel";
import { proFeatureEnabled } from "@/features/pro/config";
import { proService } from "@/features/pro/server";

export const metadata: Metadata = { title: "Inspora Pro", robots: { index: false, follow: false, nocache: true } };

async function Content({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await connection();
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Faccount%2Fpro" as Route);
  const summary = await proService().summary(userId);
  const now = new Date();
  const current = summary.subscriptions.find((s) => !s.endedAt && s.paidThrough && s.paidThrough > now) ?? null;
  const view: ProAccountView = {
    active: summary.entitlement.active,
    reason: summary.entitlement.active ? null : summary.entitlement.reason,
    closed: summary.account?.state === "closed",
    paidThrough: summary.entitlement.paidThrough?.toISOString() ?? null,
    cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
    hasCustomer: Boolean(summary.account?.stripeCustomerId),
    includedResetsAt: summary.account?.includedPeriodEnd?.toISOString() ?? null,
    balances: summary.balances ?? { included: 0, purchased: 0, available: 0 },
    autoRecharge: {
      enabled: summary.account?.autoRechargeEnabled ?? false,
      capCents: summary.account?.autoRechargeCapCents ?? null,
      spentCents: summary.capSpentCents,
      notice: summary.account?.autoRechargeNotice ?? null,
      consentForCurrent: Boolean(current && summary.account?.autoRechargeSubscriptionId === current.stripeSubscriptionId),
    },
    usage: summary.usage.map((u) => ({ id: u.id, credits: u.credits, at: u.at?.toISOString() ?? null, results: u.resultCount ?? 0 })),
    purchases: summary.purchases.map((p) => ({ id: p.id, kind: p.kind, state: p.state, credits: p.credits, chargedCents: p.chargedAmountCents, refundedCents: p.refundedAmountCents, at: p.createdAt.toISOString() })),
    checkout: (await searchParams).checkout ?? null,
  };
  return <ProAccountPanel view={view} />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  // Preview-only until separately approved: dark unless explicitly enabled.
  if (!proFeatureEnabled()) notFound();
  return (
    <>
      <SiteNavbar />
      <Suspense fallback={<main className="mx-auto max-w-[880px] px-4 py-16 text-sm text-[#767676]">Loading Inspora Pro…</main>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}
