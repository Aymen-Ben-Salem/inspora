import type { CSSProperties } from "react";

export type DashboardIconName = "overview" | "campaigns" | "billing" | "eye" | "click" | "chart" | "people" | "calendar" | "left" | "right" | "up" | "down" | "close";
const paths: Record<DashboardIconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  campaigns: "M4 6h16v14H4z M8 3v6 M16 3v6 M4 11h16 M8 15h4",
  billing: "M4 5h16v14H4z M4 10h16 M8 15h3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  click: "m5 3 14 9-7 1-3 7-4-17Z M13 15l5 6",
  chart: "M4 19h16 M7 14v-3 M12 14V5 M17 14V8",
  people: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3 M19 4a3 3 0 0 1 0 6 M22 19v-2a5 5 0 0 0-3-4",
  calendar: "M4 5h16v16H4z M8 3v5 M16 3v5 M4 11h16 M8 15h2 M14 15h2",
  left: "m14 6-6 6 6 6",
  right: "m10 6 6 6-6 6",
  up: "M5 16 16 5 M6 5h10v10",
  down: "m5 8 11 11 M6 19h10V9",
  close: "m6 6 12 12 M6 18 18 6",
};
export function DashboardIcon({ name, className = "size-4", style }: { name: DashboardIconName; className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
