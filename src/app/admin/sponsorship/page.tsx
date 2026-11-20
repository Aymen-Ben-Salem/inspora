import type { Route } from "next";
import Link from "next/link";
import { AdminLibraryPagination } from "@/components/admin/library-pagination";
import { AdminBillingControls } from "@/components/sponsorship/admin-billing-controls";
import { AnalyticsOverview } from "@/components/sponsorship/analytics-overview";
import { DashboardIcon } from "@/components/sponsorship/dashboard-icon";
import { DashboardSidebar, dashboardNavClass } from "@/components/sponsorship/dashboard-navigation";
import styles from "@/components/sponsorship/dashboard.module.css";
import { parseAdminPage } from "@/features/admin/library-pagination";
import { readAdminSponsorCampaigns, readSponsorBillingAdministration } from "@/features/sponsorship/admin-billing";

const path = "/admin/sponsorship";
const tabs = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "campaigns", label: "Campaigns", icon: "campaigns" },
  { id: "billing", label: "Billing", icon: "billing" },
  { id: "sponsors", label: "Sponsors & seats", icon: "people" },
] as const;
type Section = typeof tabs[number]["id"];
type AdminData = Awaited<ReturnType<typeof readSponsorBillingAdministration>>;
type Account = AdminData["accounts"][number];
type Params = { account?: string; section?: string; page?: string; jobsPage?: string; exceptionsPage?: string };

function linkTo(section: Section, account?: string) {
  const query = new URLSearchParams({ section });
  if (account) query.set("account", account);
  return `${path}?${query}` as Route;
}
function date(value: Date | null) {
  return value?.toLocaleDateString("en-GB", { timeZone: "UTC", dateStyle: "medium" }) ?? "—";
}
function paymentType(account: Account) {
  if (account.invoiceInviteId) return "One-time invoice";
  if (account.billingMode === "one_time") return "One-time payment";
  return account.cancelAtPeriodEnd ? "Subscription ending" : "Subscription";
}

function SponsorDirectory({ data }: { data: AdminData }) {
  const occupied = data.seats.filter(seat => seat.state === "occupied").length;
  return <>
    <section aria-labelledby="seats-heading">
      <h2 id="seats-heading" className="text-lg font-medium">Seats <span className={`ml-2 text-sm ${styles.muted}`}>{occupied} of {data.seats.length} occupied</span></h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.seats.map(seat => <article key={seat.slot} className={styles.metric}>
          <h3 className={styles.metricHeader}>Seat {seat.slot}<span className={styles.statusBadge} data-active={seat.state === "occupied"}>{seat.state}</span></h3>
          {seat.accountId ? <Link href={linkTo("overview", seat.accountId)} className="focus-ring mt-3 block break-words font-medium underline">{seat.campaignTitle ?? "Sponsor account"}</Link>
            : seat.campaignTitle && <p className="mt-3">{seat.campaignTitle}</p>}
          {seat.accountId && <p className={`mt-1 text-xs ${styles.muted}`}>{seat.published ? "Published campaign" : "No published campaign"}</p>}
          {seat.paidThrough && <p className={`mt-2 text-xs ${styles.muted}`}>Paid through {date(seat.paidThrough)}</p>}
          {seat.reservedUntil && <p className="mt-2 text-xs">Reserved until {seat.reservedUntil.toUTCString()}</p>}
          {seat.checkoutId && <details className="mt-4 text-sm"><summary className="focus-ring cursor-pointer">Seat controls</summary><AdminBillingControls checkoutId={seat.checkoutId} /></details>}
        </article>)}
      </div>
    </section>
    <section className={styles.surface} aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" className="text-lg font-medium">Sponsor accounts</h2>
      <ul className="mt-3 divide-y divide-[#e7ebf2]">{data.accounts.map(account => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><Link href={linkTo("overview", account.id)} className="focus-ring break-all font-medium underline">{account.campaignTitle ?? account.id}</Link>
          <p className={`mt-1 text-sm ${styles.muted}`}>{paymentType(account)} · {account.state}</p></div>
        {account.invoiceInviteId && <a className="focus-ring text-sm underline" href={`/sponsor/dashboard/invite/${account.invoiceInviteId}`}>Sponsor invite</a>}
      </li>)}</ul>
      {!data.accounts.length && <p className={styles.empty}>No sponsor accounts yet.</p>}
      <AdminLibraryPagination path={path} {...data.accountPagination} query={{ section: "sponsors", account: data.selectedAccount?.id }} />
    </section>
  </>;
}

function Billing({ data }: { data: AdminData }) {
  const account = data.selectedAccount;
  const query = { section: "billing", account: account?.id, exceptionsPage: String(data.exceptionPagination.page), jobsPage: String(data.jobPagination.page) };
  return <>
    {account && <section className={styles.surface}>
      <h2 className="text-lg font-medium">{paymentType(account)}</h2>
      <dl className={`${styles.billingPeriod} mt-4`}>
        <div><dt className={styles.muted}>Period start</dt><dd>{date(account.periodStart)}</dd></div>
        <div><dt className={styles.muted}>Paid through</dt><dd>{date(account.paidThrough)}</dd></div>
      </dl>
      <p className={`${styles.statusBadge} mt-4 capitalize`} data-active={account.state === "active"}>{account.state}</p>
    </section>}
    <section className={styles.surface}>
      <h2 className="text-lg font-medium">Payment exceptions across all sponsors</h2>
      {data.exceptions.map(item => <div key={item.id} className="mt-4 text-sm"><p className="break-all">Checkout {item.id} · {item.exceptionCode}</p>
        <AdminBillingControls checkoutId={item.id} exception={item.exceptionCode === "late_payment_refund_review"} /></div>)}
      {!data.exceptions.length && <p className={`mt-3 text-sm ${styles.muted}`}>No recorded payment exceptions.</p>}
      <AdminLibraryPagination path={path} {...data.exceptionPagination} pageParam="exceptionsPage" query={query} />
    </section>
    <section className={styles.surface}>
      <h2 className="text-lg font-medium">Pending work across all sponsors</h2>
      <ul className="mt-3 space-y-2 text-sm">{data.jobs.map(job => <li key={job.id}>{job.kind} · {job.state} · {job.attempts} attempts · {job.errorCode ?? "queued"}</li>)}</ul>
      {!data.jobs.length && <p className={`mt-3 text-sm ${styles.muted}`}>No pending work.</p>}
      <AdminLibraryPagination path={path} {...data.jobPagination} pageParam="jobsPage" query={query} />
    </section>
  </>;
}

function Campaigns({ campaigns }: { campaigns: Awaited<ReturnType<typeof readAdminSponsorCampaigns>> }) {
  return <section className={styles.surface} aria-labelledby="campaigns-heading">
    <h2 id="campaigns-heading" className="text-lg font-medium">All campaigns</h2>
    <ul className="mt-3 divide-y divide-[#e7ebf2]">{campaigns.map(campaign => <li key={campaign.id} id={`campaign-${campaign.id}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-4 py-4">
      <div className="min-w-0"><h3 className="font-medium">{campaign.title}</h3>
        {campaign.url && <p className={`mt-1 break-all text-sm ${styles.muted}`}>{campaign.url}</p>}
        <p className={`mt-1 text-xs ${styles.muted}`}>Version {campaign.revision} · Updated {date(campaign.updatedAt)}</p></div>
      <span className={`${styles.statusBadge} capitalize`} data-active={campaign.state === "published"}>{campaign.state}</span>
    </li>)}</ul>
    {!campaigns.length && <p className={styles.empty}>No campaigns for this sponsor.</p>}
  </section>;
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const data = await readSponsorBillingAdministration({ page: parseAdminPage(params.page), exceptionsPage: parseAdminPage(params.exceptionsPage),
    jobsPage: parseAdminPage(params.jobsPage), accountId: params.account });
  const account = data.selectedAccount;
  const tab = tabs.find(item => item.id === params.section) ?? tabs[0];
  const directory = tab.id === "sponsors";
  return <div className={`${styles.shell} grid min-h-[75dvh] items-start gap-6 lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-8`}>
    <DashboardSidebar showReportLinks={tab.id === "overview" && Boolean(account)}>
      <p className={styles.sidebarTitle}><span className={styles.brandMark}><DashboardIcon name="chart" /></span>Sponsorship</p>
      <nav aria-label="Sponsorship sections" className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap lg:flex-col">
        {tabs.map(item => <Link key={item.id} prefetch={false} href={linkTo(item.id, account?.id)} aria-current={tab.id === item.id ? "page" : undefined} className={dashboardNavClass(tab.id === item.id)}>
          <DashboardIcon name={item.icon} />{item.label}
        </Link>)}
      </nav>
    </DashboardSidebar>
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>{!directory && account && <p className={`mb-1 text-sm font-medium ${styles.muted}`}>{account.campaignTitle ?? account.id}</p>}
          <h1 className={styles.heading}>{tab.label}</h1></div>
        {!directory && <Link href={linkTo("sponsors", account?.id)} className="focus-ring text-sm underline">Choose sponsor</Link>}
      </header>
      {directory && <SponsorDirectory data={data} />}
      {tab.id === "billing" && <Billing data={data} />}
      {tab.id === "overview" && account && <AnalyticsOverview key={account.id} adminAccountId={account.id} />}
      {tab.id === "campaigns" && account && <Campaigns campaigns={await readAdminSponsorCampaigns(account.id)} />}
      {!account && !directory && <p className={styles.empty}>{params.account ? "Sponsor account unavailable." : "No sponsor selected."}</p>}
    </div>
  </div>;
}
