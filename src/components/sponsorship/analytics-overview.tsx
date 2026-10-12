"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type {
  Breakdown,
  MetricsFilter,
  ReportResult,
} from "@/analytics/first-party/query";
import type { readOwnAnalyticsCatalog } from "@/features/sponsorship/analytics";
import { NavbarMenu } from "@/components/navbar-menu";
const number = new Intl.NumberFormat("en");
const surface = "min-w-0 rounded-md border border-[#f0f0f0] p-5 sm:p-6";
const select =
  "focus-ring min-h-11 cursor-pointer rounded-md border border-[#e6e6e6] bg-white px-3 text-sm";
function ReportFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return <NavbarMenu
    label={label}
    trigger={<><span className="min-w-0 truncate">{options.find(option => option.value === value)?.label ?? value}</span><Image src="/icons/logos-filter-chevron.svg" alt="" aria-hidden width={9.2} height={5.2} className="h-[5.2px] w-[9.2px] shrink-0" /></>}
    triggerClassName={`${select} inline-flex max-w-[min(280px,calc(100vw-2rem))] items-center gap-3`}
    menuClassName="left-0 w-max min-w-full max-w-[min(340px,calc(100vw-2rem))] max-h-80 overflow-y-auto"
    items={options.map(option => ({ label: option.label, selected: option.value === value, onSelect: () => onChange(option.value) }))}
  />;
}
export const VISITOR_DEFINITION =
  "Visitors counted anonymously without cookies. Shared networks may count together; changing networks or browsers can count again. Identifiers reset monthly, so a range crossing months can count a returning visitor again. Missing trusted identity is excluded from reach. Blockers, opt-out and network failures reduce coverage.";
export function AnalyticsTable({
  title,
  rows,
  labels = {},
  site = false,
}: {
  title: string;
  rows: Breakdown[];
  labels?: Record<string, string>;
  site?: boolean;
}) {
  return (
    <section className={surface}>
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[#767676]">
              <th className="pb-3 pr-4 font-normal">{title}</th>
              <th className="pb-3 pr-4 font-normal">
                {site ? "Page views" : "Impressions"}
              </th>
              <th className="pb-3 pr-4 font-normal">
                {site ? "Unique visitors" : "Clicks"}
              </th>
              {!site ? <th className="pb-3 font-normal">CTR</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-[#f0f0f0]">
                <th
                  scope="row"
                  className="max-w-60 break-words py-3 pr-4 font-normal"
                >
                  {labels[row.label] ?? row.label}
                </th>
                <td className="py-3 pr-4 tabular-nums">
                  {number.format(site ? row.pageviews : row.impressions)}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {number.format(site ? row.siteVisitors : row.clicks)}
                </td>
                {!site ? (
                  <td className="py-3 tabular-nums">
                    {row.ctr === null ? "—" : `${row.ctr.toFixed(2)}%`}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="mt-4 text-sm text-[#767676]">
          No accepted activity in this range.
        </p>
      ) : null}
    </section>
  );
}
export function DeliveryChart({ rows: observedRows, start, end }: {
  rows: Breakdown[];
  start: string;
  end: string;
}) {
  const dayMs = 86400000;
  const byDay = new Map(observedRows.map(row => [row.label.slice(0, 10), row]));
  const rows: Pick<Breakdown, "label" | "impressions" | "clicks">[] = [];
  for (let day = Math.floor(Date.parse(start) / dayMs) * dayMs; day < Date.parse(end); day += dayMs) {
    const label = new Date(day).toISOString().slice(0, 10), observed = byDay.get(label);
    rows.push({ label, impressions: observed?.impressions ?? 0, clicks: observed?.clicks ?? 0 });
  }
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [row.impressions, row.clicks]),
  );
  const points = (field: "impressions" | "clicks") =>
    rows
      .map(
        (row, i) =>
          `${20 + (i * 760) / Math.max(1, rows.length - 1)},${180 - (row[field] / max) * 150}`,
      )
      .join(" ");
  return (
    <section className={surface}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-lg font-medium">Performance</h3>
        <p className="text-xs text-[#767676]">Impressions · Clicks</p>
      </div>
      <p className="mt-1 text-xs text-[#767676]">
        Daily delivery and activations · UTC
      </p>
      <svg
        role="img"
        aria-label="Daily impressions and clicks"
        viewBox="0 0 800 220"
        className="mt-5 w-full"
      >
        {[30, 80, 130, 180].map((y) => (
          <line key={y} x1="20" y1={y} x2="780" y2={y} stroke="#f0f0f0" />
        ))}
        <polyline
          fill="none"
          stroke="#262626"
          strokeWidth="2"
          points={points("impressions")}
        />
        <polyline
          fill="none"
          stroke="#999"
          strokeWidth="2"
          points={points("clicks")}
        />
        {rows.length ? (
          <>
            <text x="20" y="210" fill="#767676" fontSize="12">
              {rows[0].label.slice(0, 10)}
            </text>
            <text x="780" y="210" textAnchor="end" fill="#767676" fontSize="12">
              {rows.at(-1)?.label.slice(0, 10)}
            </text>
          </>
        ) : null}
      </svg>
      <details className="text-xs text-[#767676]">
        <summary className="focus-ring cursor-pointer">
          Read daily figures
        </summary>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              {row.label}: {row.impressions} impressions, {row.clicks} clicks
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
type Catalog = Awaited<ReturnType<typeof readOwnAnalyticsCatalog>>;
export function AnalyticsOverview() {
  const [filter, setFilter] = useState<MetricsFilter>({ range: "30d" }),
    [data, setData] = useState<ReportResult | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [nextRefresh, setNextRefresh] = useState(0);
  const manual = useRef(false);
  useEffect(() => {
    if (!nextRefresh) return;
    const timer = setTimeout(() => setNextRefresh(0), 60000);
    return () => clearTimeout(timer);
  }, [nextRefresh]);
  useEffect(() => {
    const controller = new AbortController(),
      force = manual.current;
    manual.current = false;
    const timer = setTimeout(() => {
      setBusy(true);
      setData(null);
    }, 0);
    const params = new URLSearchParams(
      Object.entries(filter).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    params.set("catalog", "1");
    if (force) params.set("refresh", "1");
    fetch(`/api/sponsorship/analytics?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error("Unavailable");
        if (!controller.signal.aborted) {
          setData(body.data);
          if (body.catalog) setCatalog(body.catalog);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setData({ status: "unavailable", source: "Inspora accepted events" });
      })
      .finally(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filter, refresh]);
  const campaigns = Object.fromEntries(
      catalog?.campaigns.map((c) => [c.id, c.title]) ?? [],
    ),
    versions = Object.fromEntries(
      catalog?.versions.map((v) => [
        v.id,
        `${campaigns[v.campaignId] ?? "Campaign"} · version ${v.revision}`,
      ]) ?? [],
    );
  const available = data && data.status !== "unavailable" ? data : null,
    current = catalog?.publicCreative;
  const update = (key: keyof MetricsFilter, value: string) =>
    setFilter((previous) => {
      const next = { ...previous, [key]: value || undefined };
      if (key === "campaignId") delete next.versionId;
      return next;
    });
  return (
    <section aria-label="Sponsorship performance" className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          <ReportFilter label="Campaign report" value={filter.campaignId ?? ""} onChange={value => update("campaignId", value)} options={[
            { value: "", label: "All campaigns" }, ...(catalog?.campaigns.map(c => ({ value: c.id, label: c.title })) ?? []),
          ]} />
        </div>
        <div
          role="group"
          aria-label="Report range"
          className="flex rounded-md border border-[#f0f0f0] bg-[#fafafa] p-1"
        >
          {(["1d", "7d", "30d"] as const).map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={filter.range === range}
              onClick={() => setFilter((previous) => ({ ...previous, range }))}
              className={`focus-ring min-h-11 cursor-pointer rounded px-3 text-sm ${filter.range === range ? "bg-white shadow-sm" : "text-[#767676]"}`}
            >
              {range === "1d" ? "1 day" : range === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>
      <details className="group text-sm text-[#767676]">
        <summary className="focus-ring w-fit cursor-pointer">More filters{[filter.versionId, filter.placement, filter.country, filter.periodId].filter(Boolean).length ? " · active" : ""}</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <ReportFilter label="Creative version" value={filter.versionId ?? ""} onChange={value => update("versionId", value)} options={[
            { value: "", label: "All versions" }, ...(catalog?.versions.filter(v => !filter.campaignId || v.campaignId === filter.campaignId).map(v => ({ value: v.id, label: versions[v.id] })) ?? []),
          ]} />
          <ReportFilter label="Placement report" value={filter.placement ?? ""} onChange={value => update("placement", value)} options={[
            { value: "", label: "All placements" }, { value: "header", label: "Navbar" }, { value: "feed", label: "Feed" }, { value: "detail", label: "Detail sidebar" },
          ]} />
          <ReportFilter label="Country report" value={filter.country ?? ""} onChange={value => update("country", value)} options={[
            { value: "", label: "All countries" }, ...(available?.country.map(c => ({ value: c.label, label: c.label })) ?? []),
          ]} />
          <ReportFilter label="Paid period" value={filter.periodId ?? ""} onChange={value => update("periodId", value)} options={[
            { value: "", label: "Recent activity" }, ...(catalog?.periods.map(p => ({ value: p.id, label: `${p.start.slice(0, 10)} – ${p.end.slice(0, 10)}` })) ?? []),
          ]} />
        </div>
      </details>
      {busy || !data ? (
        <p role="status" className="py-10 text-sm text-[#767676]">
          Loading performance…
        </p>
      ) : !available ? (
        <p role="status" className={surface}>
          Performance is unavailable. Refresh to try again; this does not mean
          zero activity.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
            {[
              ["Impressions", number.format(available.summary.impressions)],
              ["Clicks", number.format(available.summary.clicks)],
              [
                "CTR",
                available.summary.ctr === null
                  ? "—"
                  : `${available.summary.ctr.toFixed(2)}%`,
              ],
              [
                "Unique visitors",
                number.format(available.summary.uniqueVisitors),
              ],
            ].map(([label, value]) => (
              <article key={label} className={surface}>
                <p
                  className="text-xs text-[#767676]"
                  title={
                    label === "Unique visitors"
                      ? VISITOR_DEFINITION
                      : label === "CTR"
                        ? "Outbound clicks divided by qualifying impressions from the same accepted events."
                        : undefined
                  }
                >
                  {label}
                </p>
                <p className="mt-3 break-words text-[26px] tracking-[-0.03em] tabular-nums sm:text-[30px]">
                  {value}
                </p>
              </article>
            ))}
          </div>
          {!available.summary.impressions && !available.summary.clicks ? (
            <p className="text-sm text-[#767676]">
              No accepted delivery yet. Results appear after public placements
              qualify.
            </p>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <DeliveryChart rows={available.daily} start={available.start} end={available.end} />
            <section className={surface}>
              <h3 className="text-lg font-medium">Public campaign</h3>
              {current ? (
                <>
                  <p className="mt-1 text-sm text-[#767676]">{current.title}</p>
                  <div className="mt-5 grid grid-cols-[1fr_1fr] items-center gap-4">
                    {current.mediaUrl ? (
                      <Image
                        src={current.mediaPosterUrl ?? current.mediaUrl}
                        width={current.mediaWidth}
                        height={current.mediaHeight}
                        unoptimized
                        alt={current.mediaAlt || current.title}
                        className="aspect-[3/2] w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/2] items-center justify-center rounded-md bg-[#262626] p-3 text-center text-sm text-white">
                        {current.title}
                      </div>
                    )}
                    <div className="min-w-0 space-y-5">
                      <div>
                        <p className="mb-2 text-xs text-[#767676]">Navbar</p>
                        {current.iconUrl ? (
                          <Image
                            src={current.iconUrl}
                            width={35}
                            height={35}
                            unoptimized
                            alt={`${current.title} icon`}
                            className="size-[35px] rounded-md border border-[#e6e6e6] object-contain p-1"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-[#767676]">
                          Sidebar wordmark
                        </p>
                        {current.wordmarkUrl ? (
                          <Image
                            src={current.wordmarkUrl}
                            width={160}
                            height={28}
                            unoptimized
                            alt={`${current.title} wordmark`}
                            className="max-h-7 w-auto max-w-full object-contain"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Link
                    prefetch
                    href={`/sponsor/campaigns/${current.id}` as Route}
                    className={`${select} mt-6 flex items-center`}
                  >
                    View campaign
                  </Link>
                </>
              ) : (
                <p className="mt-6 text-sm text-[#767676]">
                  No public campaign.
                </p>
              )}
            </section>
          </div>
          <details className={surface}>
            <summary className="focus-ring cursor-pointer text-base font-medium">Audience and delivery</summary>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
            <AnalyticsTable
              title="Placements"
              rows={available.placement}
              labels={{
                header: "Navbar",
                feed: "Feed",
                detail: "Detail sidebar",
              }}
            />
            <AnalyticsTable title="Countries" rows={available.country} />
            <AnalyticsTable title="Devices" rows={available.device} />
            <AnalyticsTable title="Referring sites" rows={available.referrer} />
            <AnalyticsTable
              title="Campaigns"
              rows={available.campaign}
              labels={campaigns}
            />
            <AnalyticsTable
              title="Creative versions"
              rows={available.version}
              labels={versions}
            />
          </div>
          </details>
          <details className={surface}>
            <summary className="focus-ring cursor-pointer text-base font-medium">Reach, cost and video</summary>
            <div className="mt-5 space-y-5">
          <section className={surface}>
            <h3 className="text-lg font-medium">Reach and efficiency</h3>
            <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                [
                  "Unique clickers",
                  number.format(available.summary.uniqueClickers),
                ],
                ["Frequency", available.summary.frequency?.toFixed(2) ?? "—"],
                [
                  "Effective CPC",
                  available.cpc === null
                    ? "—"
                    : `${available.spend?.currency.toUpperCase()} ${available.cpc.toFixed(2)}`,
                ],
                [
                  "Effective CPM",
                  available.cpm === null
                    ? "—"
                    : `${available.spend?.currency.toUpperCase()} ${available.cpm.toFixed(2)}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[#767676]">{label}</dt>
                  <dd className="mt-2 text-xl tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-5 text-[#767676]">
              Base spend allocated by campaign-active time:{" "}
              {available.spend
                ? `${available.spend.currency.toUpperCase()} ${available.spend.amount.toFixed(2)}`
                : "unavailable for this filter or incomplete history"}
              . Verified refunds are reflected; spend is unavailable when their
              fee/tax split is unknown. Tax and fees are excluded. A click does not establish a
              destination visit, signup or sale.
            </p>
          </section>
          <section className={surface}>
            <h3 className="text-lg font-medium">Video preview performance</h3>
            <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
              {[
                ["Preview starts", available.summary.previewStarts],
                ["2-second playback", available.summary.previewViews],
                ["25%", available.summary.progress25],
                ["50%", available.summary.progress50],
                ["75%", available.summary.progress75],
                ["First-cycle completion", available.summary.progress100],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[#767676]">{label}</dt>
                  <dd className="mt-2 text-xl tabular-nums">
                    {number.format(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs text-[#767676]">
              Measures the displayed preview while visible, with loops excluded.
              Playback is separate from the one-second placement impression.
            </p>
          </section>
            </div>
          </details>
          <details className="text-sm leading-6 text-[#767676]">
            <summary className="focus-ring cursor-pointer">
              How these metrics are measured
            </summary>
            <p className="mt-3">{VISITOR_DEFINITION}</p>
            <p className="mt-2">
              Identity coverage:{" "}
              {available.summary.identityCoverage === null
                ? "no impressions"
                : `${(available.summary.identityCoverage * 100).toFixed(1)}% of impressions`}
              . Unique clickers use click identities; frequency is unavailable
              when impression identity coverage is incomplete. Countries use
              deployment-provided network location, with VPN and mapping
              limitations. Unknown means no trustworthy country was available.
            </p>
            <p className="mt-2">
              Ranges are rolling 24 hours, 7 days or 30 days, with UTC graph
              buckets. Impressions require at least 50% visibility continuously
              for one foreground second. CTR is unavailable with no impressions
              and can exceed 100% when activations outnumber qualifying
              exposures.
            </p>
          </details>
        </>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4 text-xs text-[#767676]">
        <p>
          {data?.source ?? "Inspora accepted events"}
          {available
            ? ` · ${available.status === "stale" ? "Stale · " : ""}Last updated ${new Date(available.asOf).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
            : ""}
        </p>
        <button
          type="button"
          className={select}
          disabled={busy || nextRefresh > 0}
          onClick={() => {
            manual.current = true;
            setNextRefresh(1);
            setRefresh((value) => value + 1);
          }}
        >
          Refresh performance
        </button>
      </footer>
    </section>
  );
}
