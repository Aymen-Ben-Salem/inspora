"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { reportWindow, rollingWindow, type MetricsFilter } from "@/analytics/first-party/query";
import type { CampaignRun } from "@/features/sponsorship/campaign-runs";
import { DashboardIcon } from "./dashboard-icon";
import styles from "./dashboard.module.css";

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
/** A campaign run with its display title, for picking report dates by campaign. */
export type ReportCampaignRun = CampaignRun & { title: string };
/** UTC days a run covers; a run ending exactly at midnight does not cover the next day. */
function runDays(run: CampaignRun, today: string) {
  const start = iso(new Date(run.start));
  const end = run.end ? iso(new Date(Math.max(Date.parse(run.end) - 1, Date.parse(run.start)))) : today;
  return { start, end: end > today ? today : end };
}

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
  function close() { setOpen(false); trigger.current?.focus(); }
  function preset(range: MetricsFilter["range"], endDate?: string) {
    onChange({ ...filter, range, endDate, startDate: undefined, periodId: undefined });
  }
  return <div className={styles.dateToolbar}>
    <div role="group" aria-label="Report range" className={styles.presets}>
      {(["30d", "7d", "1d"] as const).map(range => <button key={range} type="button" aria-pressed={!filter.startDate && !filter.endDate && !filter.periodId && filter.range === range} onClick={() => preset(range)}>{range === "1d" ? "1 day" : range === "7d" ? "7 days" : "30 days"}</button>)}
      <button type="button" aria-pressed={!filter.startDate && !filter.periodId && filter.range === "1d" && filter.endDate === yesterday} onClick={() => preset("1d", yesterday)}>Yesterday</button>
    </div>
    <button ref={trigger} type="button" className={styles.dateTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <DashboardIcon name="calendar" />
      <span>{filter.periodId ? "Select date range" : `${shortDate(start)} – ${shortDate(end)}, ${end.slice(0, 4)}`}</span>
      <DashboardIcon name="chevron" className="size-4" />
    </button>
    <span className={styles.timezone}>UTC</span>
    {open && <RangeCalendar start={start} end={end} today={today} runs={runs} onClose={close} onApply={(startDate, endDate) => {
      onChange({ ...filter, startDate, endDate, periodId: undefined });
      close();
    }} />}
  </div>;
}

function RangeCalendar({ start, end, today, runs, onClose, onApply }: { start: string; end: string; today: string; runs: ReportCampaignRun[]; onClose(): void; onApply(start: string, end: string): void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), hintId = useId();
  const [draftStart, setStart] = useState(start), [draftEnd, setEnd] = useState(end);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [month, setMonth] = useState(monthStart(end));
  const [focusedDay, setFocusedDay] = useState(end);
  const [hovered, setHovered] = useState<string | null>(null);
  const min = addDays(today, -89);
  const runId = useId();
  const [runIndex, setRunIndex] = useState(0);
  const run = runs[runIndex];
  const runRange = run ? runDays(run, today) : null;
  const clamp = (day: string) => day < min ? min : day > today ? today : day;
  const runRetained = Boolean(runRange && runRange.end >= min);
  function pickRunDates(edge: "start" | "end" | "both") {
    if (!runRange || !runRetained) return;
    const runStart = clamp(runRange.start), runEnd = clamp(runRange.end);
    const nextStart = edge === "end" ? (draftStart > runEnd ? runStart : draftStart) : runStart;
    const nextEnd = edge === "start" ? (draftEnd < runStart ? runEnd : draftEnd) : runEnd;
    setStart(nextStart); setEnd(nextEnd); setSelectingEnd(false);
    const focus = edge === "start" ? nextStart : nextEnd;
    setFocusedDay(focus); setMonth(monthStart(focus));
  }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const valid = draftStart >= min && draftStart <= draftEnd && draftEnd <= today;
  function close() { dialog.current?.close(); onClose(); }
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
          const campaignMark = runRange && (day === runRange.start || (run?.end && day === runRange.end)) ? true : undefined;
          return <button key={day} type="button" data-day={day} disabled={day < min || day > today} tabIndex={day === focusedDay ? 0 : -1} aria-label={dayDate(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} aria-pressed={selected} aria-current={day === today ? "date" : undefined} data-range={selected || undefined} data-edge={day === previewStart || day === previewEnd || undefined} data-campaign-mark={campaignMark} onClick={() => pick(day)} onKeyDown={event => moveFocus(event, day)} onPointerEnter={() => setHovered(day)}>{i + 1}</button>;
        })}
      </div>
    </section>;
  }
  return <dialog ref={dialog} className={styles.calendarDialog} aria-labelledby={titleId} aria-describedby={hintId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.calendarContent}>
      <header className={styles.calendarHeader}><div><h2 id={titleId}>Select a period</h2><p id={hintId}>Choose a start and end date · UTC</p></div><button type="button" className={styles.iconButton} onClick={close} aria-label="Close date picker"><DashboardIcon name="close" /></button></header>
      <div className={styles.dateInputs}>
        <label>Start date<input type="date" aria-label="Start date" min={min} max={draftEnd || today} value={draftStart} onChange={event => { setStart(event.target.value); setSelectingEnd(false); }} /></label>
        <span aria-hidden="true">→</span>
        <label>End date<input type="date" aria-label="End date" min={draftStart || min} max={today} value={draftEnd} onChange={event => { setEnd(event.target.value); setSelectingEnd(false); }} /></label>
      </div>
      {runs.length ? <div className={styles.campaignDates}>
        <label htmlFor={runId}>Campaign dates</label>
        <div className={styles.campaignDatesRow}>
          <select id={runId} value={runIndex} onChange={event => setRunIndex(Number(event.target.value))}>
            {runs.map((option, index) => {
              const days = runDays(option, today);
              return <option key={`${option.campaignId}-${option.start}`} value={index}>{`${option.title} · ${shortDate(days.start)} – ${option.end ? shortDate(days.end) : "live now"}`}</option>;
            })}
          </select>
          <div role="group" aria-label="Use campaign dates" className={styles.campaignDateButtons}>
            <button type="button" disabled={!runRetained} onClick={() => pickRunDates("start")}>Use start</button>
            <button type="button" disabled={!runRetained} onClick={() => pickRunDates("end")}>Use end</button>
            <button type="button" disabled={!runRetained} onClick={() => pickRunDates("both")}>Use both</button>
          </div>
        </div>
        {runRange && !runRetained ? <p>This campaign ran before the last 90 days, so its detailed metrics are no longer available.</p>
          : runRange && runRange.start < min ? <p>Detailed metrics are kept for 90 days, so this campaign’s range starts {shortDate(min)}.</p>
          : runRange ? <p>{run?.end ? `Ran ${shortDate(runRange.start)} – ${shortDate(runRange.end)}, ${runRange.end.slice(0, 4)}` : `Live since ${shortDate(runRange.start)}, ${runRange.start.slice(0, 4)}`} · marked in the calendar</p> : null}
      </div> : null}
      <div className={styles.calendarNavigation}>
        <button type="button" className={styles.iconButton} aria-label="Previous month" disabled={month <= monthStart(min)} onClick={() => { setMonth(addMonths(month, -1)); setFocusedDay(addMonths(month, -1) < min ? min : addMonths(month, -1)); }}><DashboardIcon name="left" /></button>
        <button type="button" className={styles.iconButton} aria-label="Next month" disabled={month >= monthStart(today)} onClick={() => { setMonth(addMonths(month, 1)); setFocusedDay(addMonths(month, 1)); }}><DashboardIcon name="right" /></button>
      </div>
      <div className={styles.months}>{renderMonth(addMonths(month, -1), true)}{renderMonth(month)}</div>
      <footer className={styles.calendarFooter}><p aria-live="polite">{!valid ? "Choose a valid range in the last 90 days." : selectingEnd ? "Now choose an end date" : `${shortDate(draftStart)} – ${shortDate(draftEnd)}`}</p><div><button type="button" onClick={close}>Cancel</button><button type="button" disabled={!valid} className={styles.applyButton} onClick={() => { dialog.current?.close(); onApply(draftStart, draftEnd); }}>Apply range</button></div></footer>
    </div>
  </dialog>;
}
