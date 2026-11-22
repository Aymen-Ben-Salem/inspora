"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { reportWindow, rollingWindow, type MetricsFilter } from "@/analytics/first-party/query";
import { NavbarMenu } from "@/components/navbar-menu";
import { DashboardIcon } from "./dashboard-icon";
import { campaignPeriods, periodDays, type CampaignPeriod, type ReportCampaignRun } from "./campaign-periods";
import styles from "./dashboard.module.css";

export type { ReportCampaignRun };
const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);
const addDays = (day: string, count: number) => iso(new Date(dayDate(day).getTime() + count * DAY));
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
function addMonths(day: string, count: number) {
  const date = dayDate(day);
  date.setUTCMonth(date.getUTCMonth() + count, 1);
  return iso(date);
}
const shortDate = (day: string) => dayDate(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const periodText = (period: CampaignPeriod) => `${shortDate(period.start)} – ${period.live ? "now" : shortDate(period.end)}`;
/** The campaign to view, and optionally another campaign over its own live dates to compare with. */
type CampaignSelection = { campaignId?: string; compare?: { campaignId: string; start: string; end: string } };

export function ReportDateRange({ filter, onChange, runs = [] }: { filter: MetricsFilter; onChange(filter: MetricsFilter): void; runs?: ReportCampaignRun[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const now = new Date();
  const today = iso(now), yesterday = addDays(today, -1);
  // A tab can stay open past the retention boundary. Keep its chosen dates
  // visible and let the picker correct them instead of throwing during render.
  let window;
  try { window = reportWindow({ ...filter, periodId: undefined }, now); }
  catch { window = rollingWindow(filter.range, now); }
  const start = filter.startDate ?? window.start.slice(0, 10), end = filter.endDate ?? iso(new Date(Date.parse(window.end) - 1));
  const periods = campaignPeriods(runs, today, addDays(today, -89));
  const titleOf = (id: string) => periods.find(period => period.campaignId === id)?.title ?? "Selected campaign";
  const dates = `${shortDate(start)} – ${shortDate(end)}, ${end.slice(0, 4)}`;
  const triggerText = filter.periodId ? "Select date range"
    : filter.campaignId && filter.compareCampaignId ? `${titleOf(filter.campaignId)} vs ${titleOf(filter.compareCampaignId)}`
    : filter.campaignId && filter.startDate ? `${titleOf(filter.campaignId)} · ${dates}` : dates;
  function close() { setOpen(false); trigger.current?.focus(); }
  function preset(range: MetricsFilter["range"], endDate?: string) {
    onChange({ ...filter, range, endDate, startDate: undefined, periodId: undefined, compareCampaignId: undefined, compareStartDate: undefined, compareEndDate: undefined });
  }
  return <div className={styles.dateToolbar}>
    <div role="group" aria-label="Report range" className={styles.presets}>
      {(["30d", "7d", "1d"] as const).map(range => <button key={range} type="button" aria-pressed={!filter.startDate && !filter.endDate && !filter.periodId && filter.range === range} onClick={() => preset(range)}>{range === "1d" ? "1 day" : range === "7d" ? "7 days" : "30 days"}</button>)}
      <button type="button" aria-pressed={!filter.startDate && !filter.periodId && filter.range === "1d" && filter.endDate === yesterday} onClick={() => preset("1d", yesterday)}>Yesterday</button>
    </div>
    <button ref={trigger} type="button" className={styles.dateTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <DashboardIcon name="calendar" />
      <span className={styles.dateTriggerText}>{triggerText}</span>
      <DashboardIcon name="chevron" className="size-4" />
    </button>
    <span className={styles.timezone}>UTC</span>
    {open && <RangeCalendar start={start} end={end} today={today} periods={periods} campaignId={filter.campaignId} compareId={filter.compareCampaignId} titleOf={titleOf} onClose={close} onApply={(startDate, endDate, selection) => {
      onChange({
        ...filter, startDate, endDate, periodId: undefined,
        campaignId: selection.campaignId,
        versionId: selection.campaignId === filter.campaignId ? filter.versionId : undefined,
        compareCampaignId: selection.compare?.campaignId,
        compareStartDate: selection.compare?.start,
        compareEndDate: selection.compare?.end,
      });
      close();
    }} />}
  </div>;
}

function RangeCalendar({ start, end, today, periods, campaignId, compareId, titleOf, onClose, onApply }: {
  start: string; end: string; today: string; periods: CampaignPeriod[]; campaignId?: string; compareId?: string;
  titleOf(id: string): string; onClose(): void; onApply(start: string, end: string, selection: CampaignSelection): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), hintId = useId();
  // Escape inside an open campaign menu closes only that menu, not the picker.
  const menuEscape = useRef(false);
  const [draftStart, setStart] = useState(start), [draftEnd, setEnd] = useState(end);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [month, setMonth] = useState(monthStart(end));
  const [focusedDay, setFocusedDay] = useState(end);
  const [hovered, setHovered] = useState<string | null>(null);
  const min = addDays(today, -89);
  const [draftCampaign, setCampaign] = useState(campaignId);
  const [draftCompare, setCompare] = useState(compareId && compareId !== campaignId ? compareId : undefined);
  const clamp = (day: string) => day < min ? min : day > today ? today : day;
  const periodOf = (id?: string) => periods.find(period => period.campaignId === id);
  const viewed = periodOf(draftCampaign), compared = periodOf(draftCompare);
  // Menu items are keyed by label, so number any repeated campaign title.
  const labels = new Map(periods.map((period, index) => {
    const repeats = periods.slice(0, index).filter(other => other.title === period.title).length;
    return [period.campaignId, repeats ? `${period.title} (${repeats + 1})` : period.title];
  }));
  function chooseCampaign(id?: string) {
    setCampaign(id);
    if (!id || draftCompare === id) setCompare(undefined);
    const period = periodOf(id);
    if (!period) return;
    // Viewing a campaign shows its own live dates; they can still be adjusted.
    setStart(clamp(period.start)); setEnd(clamp(period.end)); setSelectingEnd(false);
    setFocusedDay(clamp(period.end)); setMonth(monthStart(clamp(period.end)));
  }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const valid = draftStart >= min && draftStart <= draftEnd && draftEnd <= today;
  function close() { dialog.current?.close(); onClose(); }
  function apply() {
    dialog.current?.close();
    onApply(draftStart, draftEnd, {
      campaignId: draftCampaign,
      compare: draftCampaign && compared ? { campaignId: compared.campaignId, start: clamp(compared.start), end: clamp(compared.end) } : undefined,
    });
  }
  function pick(day: string) {
    setFocusedDay(day);
    if (!selectingEnd) { setStart(day); setEnd(day); setSelectingEnd(true); }
    else { setStart(day < draftStart ? day : draftStart); setEnd(day < draftStart ? draftStart : day); setSelectingEnd(false); }
  }
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -dayDate(day).getUTCDay(), End: 6 - dayDate(day).getUTCDay() };
    let next = event.key === "PageUp" ? addMonths(day, -1) : event.key === "PageDown" ? addMonths(day, 1) : event.key in offsets ? addDays(day, offsets[event.key]) : null;
    if (!next) return;
    event.preventDefault();
    next = next < min ? min : next > today ? today : next;
    setFocusedDay(next);
    if (monthStart(next) !== month) setMonth(monthStart(next));
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  }
  const previewStart = selectingEnd && hovered && hovered < draftStart ? hovered : draftStart;
  const previewEnd = selectingEnd && hovered ? (hovered < draftStart ? draftStart : hovered) : draftEnd;
  function renderMonth(monthDay: string, previous = false) {
    const date = dayDate(monthDay), offset = date.getUTCDay();
    const length = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return <section className={previous ? styles.previousMonth : undefined} aria-label={date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}>
      <h3 className={styles.monthTitle}>{date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
      <div className={styles.weekdays} aria-hidden="true">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day}>{day}</span>)}</div>
      <div className={styles.days} onPointerLeave={() => setHovered(null)}>
        {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const day = addDays(monthDay, i), selected = day >= previewStart && day <= previewEnd;
          return <button key={day} type="button" data-day={day} disabled={day < min || day > today} tabIndex={day === focusedDay ? 0 : -1} aria-label={dayDate(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} aria-pressed={selected} aria-current={day === today ? "date" : undefined} data-range={selected || undefined} data-edge={day === previewStart || day === previewEnd || undefined} onClick={() => pick(day)} onKeyDown={event => moveFocus(event, day)} onPointerEnter={() => setHovered(day)}>{i + 1}</button>;
        })}
      </div>
    </section>;
  }
  const menuClass = "w-[min(20rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100dvh-2rem))] overflow-y-auto";
  return <dialog ref={dialog} className={styles.calendarDialog} aria-labelledby={titleId} aria-describedby={hintId} onKeyDown={event => { if (event.key === "Escape") menuEscape.current = Boolean(dialog.current?.querySelector('[data-navbar-menu] > button[aria-expanded="true"]')); }} onCancel={event => { event.preventDefault(); if (menuEscape.current) { menuEscape.current = false; return; } close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.calendarContent}>
      <header className={styles.calendarHeader}><div><h2 id={titleId}>Select a period</h2><p id={hintId}>Choose dates, or a campaign to view and another to compare · UTC</p></div><button type="button" className={styles.iconButton} onClick={close} aria-label="Close date picker"><DashboardIcon name="close" /></button></header>
      <div className={styles.dateInputs}>
        <label>Start date<input type="date" aria-label="Start date" min={min} max={draftEnd || today} value={draftStart} onChange={event => { setStart(event.target.value); setSelectingEnd(false); }} /></label>
        <span aria-hidden="true">→</span>
        <label>End date<input type="date" aria-label="End date" min={draftStart || min} max={today} value={draftEnd} onChange={event => { setEnd(event.target.value); setSelectingEnd(false); }} /></label>
      </div>
      {periods.length ? <div className={styles.campaignPicker}>
        <div className={styles.campaignField}>
          <p>Campaign</p>
          <NavbarMenu label={`Campaign: ${draftCampaign ? titleOf(draftCampaign) : "All campaigns"}`} keepInViewport
            trigger={<><span className={styles.filterValue}>{draftCampaign ? labels.get(draftCampaign) ?? titleOf(draftCampaign) : "All campaigns"}</span><DashboardIcon name="chevron" /></>}
            triggerClassName={styles.filterOptionTrigger}
            menuClassName={menuClass}
            items={[
              { label: "All campaigns", selected: !draftCampaign, onSelect: () => chooseCampaign(undefined) },
              ...periods.map(period => ({ label: labels.get(period.campaignId)!, selected: period.campaignId === draftCampaign, onSelect: () => chooseCampaign(period.campaignId) })),
            ]}
          />
          <small>{viewed ? `${periodText(viewed)} · ${periodDays(viewed)} days` : "Pick one to see its live dates"}</small>
        </div>
        <span aria-hidden="true">vs</span>
        <fieldset disabled={!draftCampaign} className={styles.campaignField}>
          <p>Compare with <span>(optional)</span></p>
          <NavbarMenu label={`Compare with: ${compared ? compared.title : "No comparison"}`} keepInViewport
            trigger={<><span className={styles.filterValue}>{compared ? labels.get(compared.campaignId) : "No comparison"}</span><DashboardIcon name="chevron" /></>}
            triggerClassName={styles.filterOptionTrigger}
            menuClassName={menuClass}
            items={[
              { label: "No comparison", selected: !compared, onSelect: () => setCompare(undefined) },
              ...periods.filter(period => period.campaignId !== draftCampaign).map(period => ({ label: labels.get(period.campaignId)!, selected: period.campaignId === draftCompare, onSelect: () => setCompare(period.campaignId) })),
            ]}
          />
          <small>{compared ? `${periodText(compared)} · ${periodDays(compared)} days` : draftCampaign ? "Pick another campaign to compare" : "Choose a campaign first"}</small>
        </fieldset>
      </div> : null}
      <div className={styles.calendarNavigation}>
        <button type="button" className={styles.iconButton} aria-label="Previous month" disabled={month <= monthStart(min)} onClick={() => { setMonth(addMonths(month, -1)); setFocusedDay(addMonths(month, -1) < min ? min : addMonths(month, -1)); }}><DashboardIcon name="left" /></button>
        <button type="button" className={styles.iconButton} aria-label="Next month" disabled={month >= monthStart(today)} onClick={() => { setMonth(addMonths(month, 1)); setFocusedDay(addMonths(month, 1)); }}><DashboardIcon name="right" /></button>
      </div>
      <div className={styles.months}>{renderMonth(addMonths(month, -1), true)}{renderMonth(month)}</div>
      <footer className={styles.calendarFooter}><p aria-live="polite">{!valid ? "Choose a valid range in the last 90 days." : selectingEnd ? "Now choose an end date" : viewed && compared ? `${viewed.title} vs ${compared.title}` : `${shortDate(draftStart)} – ${shortDate(draftEnd)}`}</p><div><button type="button" onClick={close}>Cancel</button><button type="button" disabled={!valid} className={styles.applyButton} onClick={apply}>Apply range</button></div></footer>
    </div>
  </dialog>;
}
