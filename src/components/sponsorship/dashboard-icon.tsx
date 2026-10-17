import type { CSSProperties } from "react";
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, ChartNoAxesColumnIncreasing,
  ChevronDown, ChevronLeft, ChevronRight, CreditCard, Download, Eye,
  Layers, LayoutDashboard, LoaderCircle, MousePointer2, Users, X,
  Plus, Trash2, Archive, FilePenLine, ExternalLink, ReceiptText, RefreshCw, ListFilter,
} from "lucide-react";

const icons = {
  overview: LayoutDashboard,
  campaigns: Layers,
  billing: CreditCard,
  eye: Eye,
  click: MousePointer2,
  chart: ChartNoAxesColumnIncreasing,
  people: Users,
  calendar: CalendarDays,
  left: ChevronLeft,
  right: ChevronRight,
  up: ArrowUpRight,
  down: ArrowDownRight,
  chevron: ChevronDown,
  close: X,
  download: Download,
  loading: LoaderCircle,
  plus: Plus,
  delete: Trash2,
  archive: Archive,
  draft: FilePenLine,
  external: ExternalLink,
  receipt: ReceiptText,
  renewal: RefreshCw,
  filter: ListFilter,
};
export type DashboardIconName = keyof typeof icons;

export function DashboardIcon({ name, className = "size-4", style }: { name: DashboardIconName; className?: string; style?: CSSProperties }) {
  const Icon = icons[name];
  return <Icon strokeWidth={1.75} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`} style={style} />;
}
