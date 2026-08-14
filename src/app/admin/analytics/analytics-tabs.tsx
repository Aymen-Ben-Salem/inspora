"use client";

import { useId, useState } from "react";

import type {
  AnalyticsBreakdown,
  AnalyticsRange,
  DailyAnalytics,
} from "@/analytics/posthog-data";

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });
const exactNumber = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

type TabOption<T extends string> = {
  label: string;
  value: T;
};

function Tabs<T extends string>({
  active,
  label,
  onChange,
  options,
  panelId,
}: {
  active: T;
  label: string;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  panelId: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex rounded-full bg-[#e9e9e5] p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${panelId}-${option.value}-tab`}
          aria-controls={panelId}
          aria-selected={active === option.value}
          onClick={() => onChange(option.value)}
          className={`focus-ring inline-flex h-8 items-center rounded-full px-3.5 text-xs transition-[background-color,color,box-shadow] duration-200 ${
            active === option.value
              ? "bg-white text-black shadow-sm"
              : "text-[#666] hover:text-black"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type TrafficMetric = "uniqueVisitors" | "pageviews";

const trafficOptions: TabOption<TrafficMetric>[] = [
  { label: "Unique visitors", value: "uniqueVisitors" },
  { label: "Pageviews", value: "pageviews" },
];

export function TrafficChart({
  daily,
  range,
}: {
  daily: DailyAnalytics[];
  range: AnalyticsRange;
}) {
  const [metric, setMetric] = useState<TrafficMetric>("uniqueVisitors");
  const panelId = useId();
  const maximum = Math.max(1, ...daily.map((day) => day[metric]));
  const metricLabel = metric === "uniqueVisitors" ? "unique visitors" : "pageviews";
  const rangeDays = typeof range === "number" ? range : 1;
  const rangeLabel =
    range === "today"
      ? "Today"
      : range === "yesterday"
        ? "Yesterday"
        : `Last ${range} days`;

  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.045em]">Daily traffic</h2>
          <p className="mt-1 text-xs text-[#888]">Reach and viewing volume over time</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-[#888]">
            {rangeLabel}
          </p>
          <Tabs
            active={metric}
            label="Traffic metric"
            onChange={setMetric}
            options={trafficOptions}
            panelId={panelId}
          />
        </div>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${metric}-tab`}
        className="mt-8 pb-6"
      >
        <div className="flex h-60 min-w-0 items-end gap-px border-b border-black/10 sm:h-64 sm:gap-1">
          {daily.map((day, index) => {
            const value = day[metric];
            const height = value === 0 ? 2 : Math.max(6, (value / maximum) * 100);
            const showLabel =
              index === 0 ||
              index === daily.length - 1 ||
              (rangeDays === 7 ? true : index % (rangeDays === 30 ? 7 : 14) === 0);
            const formattedDate = dateFormatter.format(new Date(`${day.date}T00:00:00Z`));

            return (
              <div
                key={day.date}
                className={`group relative flex h-full items-end ${
                  rangeDays === 1 ? "w-12 flex-none" : "min-w-0 flex-1"
                }`}
              >
                <div
                  className="w-full rounded-t-sm bg-[#222] transition-[height,background-color] duration-200 group-hover:bg-[#777]"
                  style={{ height: `${height}%` }}
                  title={`${formattedDate}: ${exactNumber.format(value)} ${metricLabel}`}
                  aria-label={`${formattedDate}: ${exactNumber.format(value)} ${metricLabel}`}
                />
                {showLabel ? (
                  <span className="absolute left-0 top-[calc(100%+8px)] whitespace-nowrap text-[10px] text-[#999]">
                    {formattedDate}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type TechnologyTab = "devices" | "browsers";

const technologyOptions: TabOption<TechnologyTab>[] = [
  { label: "Devices", value: "devices" },
  { label: "Browsers", value: "browsers" },
];

export function AudienceTechnologyCard({
  browsers,
  devices,
  visitorUnit,
}: {
  browsers: AnalyticsBreakdown[];
  devices: AnalyticsBreakdown[];
  visitorUnit: string;
}) {
  const [tab, setTab] = useState<TechnologyTab>("devices");
  const panelId = useId();
  const items = tab === "devices" ? devices : browsers;
  const maximum = Math.max(1, ...items.map((item) => item.visitors));

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em]">Technology</h2>
          <p className="mt-1 text-xs text-[#888]">Devices and browsers</p>
        </div>
        <Tabs
          active={tab}
          label="Audience technology"
          onChange={setTab}
          options={technologyOptions}
          panelId={panelId}
        />
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${tab}-tab`}
      >
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#888]">
            {tab === "devices" ? "Device" : "Browser"} data will appear here.
          </p>
        ) : (
          <ol className="mt-6 divide-y divide-black/10">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="relative overflow-hidden py-4">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 rounded-md bg-[#f1f1ee]"
                  style={{ width: `${Math.max(4, (item.visitors / maximum) * 100)}%` }}
                />
                <div className="relative flex min-w-0 items-center gap-3 px-3">
                  <span className="w-5 shrink-0 text-xs text-[#999]">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span
                    className="shrink-0 text-xs tabular-nums text-[#777]"
                    title={`${exactNumber.format(item.visitors)} ${visitorUnit}, ${exactNumber.format(item.pageviews)} pageviews`}
                  >
                    {compactNumber.format(item.visitors)} {visitorUnit} ·{" "}
                    {compactNumber.format(item.pageviews)} views
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
