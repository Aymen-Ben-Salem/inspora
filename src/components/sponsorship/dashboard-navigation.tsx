import { DashboardIcon } from "./dashboard-icon";
import styles from "./dashboard.module.css";

export const dashboardSections = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "billing", label: "Billing" },
  { id: "settings", label: "Settings" },
] as const;
export type DashboardSection = typeof dashboardSections[number]["id"];

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
        className={`${styles.navItem} focus-ring inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none lg:justify-start ${section === item.id ? "font-medium" : "text-[#66758c] hover:bg-[#f3f6fc] hover:text-[#262626]"}`}>
        <DashboardIcon name={item.id} />{item.label}
      </button>)}
    </nav>
  </>;
}
