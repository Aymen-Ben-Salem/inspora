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
import { dailyReportRows } from "@/analytics/first-party/query";
import { sponsorReportCsv } from "@/analytics/first-party/csv";
import { sponsorButton } from "./button-styles";
const number = new Intl.NumberFormat("en");
const surface = "min-w-0 rounded-md border border-[#f0f0f0] bg-white p-4 sm:p-5";
const select =
  "focus-ring min-h-11 cursor-pointer rounded-md bg-[#fafafa] px-3 text-sm text-[#262626] transition-colors hover:bg-[#f0f0f0] disabled:cursor-not-allowed disabled:opacity-40";
function ReportFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return <NavbarMenu
    keepInViewport
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
  plain = false,
}: {
  title: string;
  rows: Breakdown[];
  labels?: Record<string, string>;
  site?: boolean;
  plain?: boolean;
}) {
  return (
    <section className={plain ? "min-w-0 py-4" : surface}>
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="mt-5 max-h-80 overflow-auto">
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
          No activity recorded for these dates and filters yet.
        </p>
      ) : null}
    </section>
  );
}
export function DeliveryChart({ rows: observedRows, start, end, plain = false, onDateChange }: {
  rows: Breakdown[];
  start: string;
  end: string;
  plain?: boolean;
  onDateChange?: (day: string) => void;
}) {
  const chart = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setChartWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rows = dailyReportRows(observedRows, start, end);
  const today = new Date().toISOString().slice(0, 10);
  const minimumDate = onDateChange ? new Date(Date.parse(`${today}T00:00:00Z`) - 89 * 86400000).toISOString().slice(0, 10) : rows[0]?.label;
  const maximumDate = onDateChange ? today : rows.at(-1)?.label;
  const chosen = rows.findIndex(row => row.label === selectedDay);
  const selectedIndex = chosen < 0 ? rows.length - 1 : chosen;
  const selected = rows[selectedIndex];
  const selectedX = 20 + (selectedIndex * (chartWidth - 40)) / Math.max(1, rows.length - 1);
  function selectAt(clientX: number) {
    if (!chart.current || !rows.length) return;
    const x = clientX - chart.current.getBoundingClientRect().left;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((x - 20) / Math.max(1, chartWidth - 40)) * (rows.length - 1))));
    setSelectedDay(rows[index].label);
  }
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [row.impressions, row.clicks]),
  );
  const points = (field: "impressions" | "clicks") =>
    rows
      .map(
        (row, i) =>
          `${20 + (i * (chartWidth - 40)) / Math.max(1, rows.length - 1)},${180 - (row[field] / max) * 150}`,
      )
      .join(" ");
  return (
    <section className={plain ? "min-w-0" : surface}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-lg font-medium">Performance</h3>
        <div className="flex items-center gap-4 text-xs text-[#767676]">
          <span className="inline-flex items-center gap-2"><span aria-hidden className="w-4 border-t-2 border-[#262626]" />Impressions</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden className="w-4 border-t-2 border-dashed border-[#999]" />Clicks</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-[#767676]">
        Daily delivery and activations · UTC
      </p>
      <svg
        ref={chart}
        role="img"
        aria-label="Daily impressions and clicks"
        viewBox={`0 0 ${chartWidth} 220`}
        className="mt-5 h-[220px] w-full"
        onPointerMove={event => selectAt(event.clientX)}
        onPointerDown={event => selectAt(event.clientX)}
      >
        {[30, 80, 130, 180].map((y) => (
          <line key={y} x1="20" y1={y} x2={chartWidth - 20} y2={y} stroke="#f0f0f0" />
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
          strokeDasharray="5 4"
          points={points("clicks")}
        />
        {selected ? (
          <g aria-hidden="true">
            <line x1={selectedX} x2={selectedX} y1="20" y2="180" stroke="#d4d4d4" strokeDasharray="3 4" />
            {(["impressions", "clicks"] as const).map(metric => (
              <circle key={metric} cx={selectedX} cy={180 - (selected[metric] / max) * 150} r="3" fill={metric === "impressions" ? "#262626" : "#999"} stroke="white" strokeWidth="1.5" />
            ))}
          </g>
        ) : null}
        {rows.length ? (
          <>
            <text x="20" y="210" fill="#767676" fontSize="12">
              {rows[0].label.slice(0, 10)}
            </text>
            <text x={chartWidth - 20} y="210" textAnchor="end" fill="#767676" fontSize="12">
              {rows.at(-1)?.label.slice(0, 10)}
            </text>
          </>
        ) : null}
      </svg>
      {selected ? (
        <div role="group" aria-label="Daily figures" className="mt-3 flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-3">
          <button type="button" aria-label="Previous day" disabled={selectedIndex === 0} onClick={() => setSelectedDay(rows[selectedIndex - 1].label)} className={`${select} flex size-11 shrink-0 items-center justify-center`}>
            <Image src="/icons/detail/arrow-left.svg" alt="" width={16} height={16} />
          </button>
          <div className="min-w-0 text-center text-xs tabular-nums">
            <label className="inline-flex max-w-full items-center gap-2 text-[#767676]">
              <input type="date" aria-label="Performance date" value={selected.label} min={minimumDate} max={maximumDate} className={`${select} min-w-0 max-w-full text-center`} onChange={event => {
                const day = event.currentTarget.value;
                if (!day || !event.currentTarget.validity.valid || day < (minimumDate ?? day) || day > (maximumDate ?? day)) return;
                setSelectedDay(day);
                if (!rows.some(row => row.label === day)) onDateChange?.(day);
              }} />
              <span>UTC</span>
            </label>
            <p aria-live="polite" aria-atomic="true" className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
              <span>{number.format(selected.impressions)} impressions</span>
              <span>{number.format(selected.clicks)} clicks</span>
            </p>
          </div>
          <button type="button" aria-label="Next day" disabled={selectedIndex === rows.length - 1} onClick={() => setSelectedDay(rows[selectedIndex + 1].label)} className={`${select} flex size-11 shrink-0 items-center justify-center`}>
            <Image src="/icons/detail/arrow-left.svg" alt="" width={16} height={16} className="rotate-180" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
type Catalog = Awaited<ReturnType<typeof readOwnAnalyticsCatalog>>;
export function AnalyticsOverview() {
  const [filter, setFilter] = useState<MetricsFilter>({ range: "30d" }),
    [loadedFilter, setLoadedFilter] = useState<MetricsFilter | null>(null),
    [data, setData] = useState<ReportResult | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [nextRefresh, setNextRefresh] = useState(0);
  const manual = useRef(false);
  useEffect(() => {
    const changed = () => setRefresh(value => value + 1);
    window.addEventListener("sponsorship-changed", changed);
    return () => window.removeEventListener("sponsorship-changed", changed);
  }, []);
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
          setLoadedFilter(filter);
          if (body.catalog) setCatalog(body.catalog);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData({ status: "unavailable", source: "Inspora accepted events" });
          setLoadedFilter(filter);
        }
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
  const available = data && loadedFilter === filter && data.status !== "unavailable" ? data : null,
    current = catalog?.publicCreative;
  const update = (key: keyof MetricsFilter, value: string) =>
    setFilter((previous) => {
      const next = { ...previous, [key]: value || undefined };
      if (key === "campaignId") delete next.versionId;
      if (key === "periodId") delete next.endDate;
      return next;
    });
  return (
    <section aria-label="Sponsorship performance" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] pb-5">
        <div role="group" aria-label="Report filters" className="flex min-w-0 flex-wrap gap-2">
          <ReportFilter label="Campaign report" value={filter.campaignId ?? ""} onChange={value => update("campaignId", value)} options={[
            { value: "", label: "All campaigns" }, ...(catalog?.campaigns.map(c => ({ value: c.id, label: c.title })) ?? []),
          ]} />
          <ReportFilter label="Creative version" value={filter.versionId ?? ""} onChange={value => update("versionId", value)} options={[
            { value: "", label: "All versions" }, ...(catalog?.versions.filter(v => !filter.campaignId || v.campaignId === filter.campaignId).map(v => ({ value: v.id, label: versions[v.id] })) ?? []),
          ]} />
          <ReportFilter label="Placement report" value={filter.placement ?? ""} onChange={value => update("placement", value)} options={[
            { value: "", label: "All placements" }, { value: "header", label: "Navbar" }, { value: "feed", label: "Feed" }, { value: "detail", label: "Detail sidebar" },
          ]} />
          <ReportFilter label="Country report" value={filter.country ?? ""} onChange={value => update("country", value)} options={[
            { value: "", label: "All countries" }, ...(available?.country.map(c => ({ value: c.label, label: c.label })) ?? []),
          ]} />
          <ReportFilter label="Closed paid period" value={filter.periodId ?? ""} onChange={value => update("periodId", value)} options={[
            { value: "", label: "Recent activity" }, ...(catalog?.periods.map(p => ({ value: p.id, label: `${p.start.slice(0, 10)} – ${p.end.slice(0, 10)}` })) ?? []),
          ]} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Report range"
          className="flex gap-1"
        >
          {(["1d", "7d", "30d"] as const).map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={filter.range === range}
              onClick={() => setFilter((previous) => ({ ...previous, range }))}
              className={`focus-ring min-h-11 cursor-pointer rounded-md px-3 text-sm transition-colors ${filter.range === range ? "bg-[#f0f0f0] text-[#262626]" : "text-[#767676] hover:bg-[#fafafa]"}`}
            >
              {range === "1d" ? "1 day" : range === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || !available} className={`${sponsorButton.secondary} gap-2`} onClick={() => {
          if (!available) return;
          const url = URL.createObjectURL(new Blob([sponsorReportCsv(available, filter, { campaigns, versions })], { type: "text/csv;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `inspora-performance-${available.start.slice(0, 10)}-${available.end.slice(0, 10)}.csv`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }}>
          <Image src="/icons/detail/download.svg" alt="" aria-hidden width={16} height={16} />
          Export CSV
        </button>
        </div>
      </div>
      {busy || !data || loadedFilter !== filter ? (
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
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
                <p className="mt-2 break-words text-[28px] leading-tight tracking-[-0.03em] tabular-nums sm:text-[32px]">
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
          <div id="report-performance" className={`${surface} scroll-mt-28`}>
            <DeliveryChart rows={available.daily} start={available.start} end={available.end} plain onDateChange={filter.periodId ? undefined : endDate => setFilter(previous => ({ ...previous, endDate }))} />
            {filter.endDate ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#767676]"><span>Through {filter.endDate} · UTC</span><button type="button" className="focus-ring min-h-11 cursor-pointer underline underline-offset-4" onClick={() => setFilter(previous => ({ ...previous, endDate: undefined }))}>Back to recent activity</button></div> : null}
          </div>
          <section id="report-reach-video" aria-labelledby="report-reach-title" className="scroll-mt-28">
            <h2 id="report-reach-title" className="text-lg font-medium">Reach, cost and video</h2>
            <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          <section className={surface}>
            <h3 className="text-lg font-medium">Reach and efficiency</h3>
            <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-2">
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
          </section>
          <section id="report-audience" aria-labelledby="report-audience-title" className="scroll-mt-28">
            <h2 id="report-audience-title" className="text-lg font-medium">Audience and delivery</h2>
            <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
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
          </section>
            <section className={surface}>
              <h3 className="text-lg font-medium">Public campaign</h3>
              {current ? (
                <>
                  <p className="mt-1 text-sm text-[#767676]">{current.title}</p>
                  <div className="mt-4 grid max-w-[440px] grid-cols-[100px_minmax(0,1fr)] items-center gap-5">
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
                    <div className="flex min-w-0 flex-wrap items-start gap-5">
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
                    className="focus-ring mt-5 inline-flex min-h-11 items-center text-sm text-[#767676] underline decoration-[#d4d4d4] underline-offset-4 hover:text-[#262626]"
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
