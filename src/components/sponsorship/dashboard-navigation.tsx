import type { ReactNode } from "react";
import { DashboardIcon } from "./dashboard-icon";
import styles from "./dashboard.module.css";

export const dashboardSections = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "billing", label: "Billing" },
  { id: "settings", label: "Settings" },
] as const;
export type DashboardSection = typeof dashboardSections[number]["id"];

export function dashboardNavClass(active: boolean) {
  return `${styles.navItem} focus-ring inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none lg:justify-start ${active ? "font-medium" : "text-[#66758c] hover:bg-[#f3f6fc] hover:text-[#262626]"}`;
}

export function DashboardNavigation({ section, onChange, locked = false }: {
  section: DashboardSection;
  onChange?(section: DashboardSection): void;
  locked?: boolean;
}) {
  return <>
    <p className={styles.sidebarTitle}><span className={styles.brandMark}><DashboardIcon name="chart" className="size-5" /></span>Your sponsorship</p>
    <nav aria-label="Sponsorship sections" className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap lg:flex-col">
      {dashboardSections.map(item => <button key={item.id} type="button"
        aria-current={section === item.id ? "page" : undefined} aria-controls={item.id}
        disabled={locked && item.id !== "settings"} onClick={() => onChange?.(item.id)}
        className={dashboardNavClass(section === item.id)}>
        <DashboardIcon name={item.id} />{item.label}
      </button>)}
    </nav>
  </>;
}

export function DashboardSidebar({ children, showReportLinks }: { children: ReactNode; showReportLinks: boolean }) {
  return (
      <aside className="min-w-0 lg:min-h-[calc(100dvh-140px)] lg:self-stretch lg:border-r lg:border-[#f0f0f0] lg:pr-5">
        <div className="lg:sticky lg:top-28">
        {children}
        {showReportLinks ? (
          <nav aria-label="On this report" className="mt-10 hidden border-t border-[#f0f0f0] pt-5 lg:block">
            <p className="mb-2 px-3 text-xs text-[#66758c]">On this report</p>
            {[["performance", "Performance"], ["reach-video", "Reach, cost & video"], ["audience", "Audience & delivery"]].map(([id, label]) => (
              <a key={id} href={`#report-${id}`} className="focus-ring flex min-h-11 items-center rounded-md px-3 text-xs text-[#66758c] transition-colors hover:bg-[#fafafa] hover:text-[#262626]">{label}</a>
            ))}
          </nav>
        ) : null}
        </div>
      </aside>
  );
}
