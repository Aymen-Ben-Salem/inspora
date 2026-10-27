import type { Route } from "next";
import Link from "next/link";
import type { PostView } from "@/domain/post";

export function AdminLibraryPagination({ path, page, totalPages, view = "latest", query = {}, pageParam = "page" }: {
  path: "/admin/posts" | "/admin/logos" | "/admin/websites" | "/admin/creators" | "/admin/submissions" | "/admin/sponsorship";
  page: number;
  totalPages: number;
  view?: PostView;
  query?: Record<string, string | undefined>;
  pageParam?: string;
}) {
  if (totalPages <= 1) return null;
  function href(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    if (view === "featured") params.set("view", view);
    if (target > 1) params.set(pageParam, String(target));
    else params.delete(pageParam);
    return `${path}${params.size ? `?${params}` : ""}` as Route;
  }
  const style = "focus-ring rounded-full border border-[#262626] bg-[#262626] px-4 py-2 text-sm text-white transition-colors hover:border-[#3f3f3f] hover:bg-[#3f3f3f]";
  return (
    <nav aria-label="Library pages" className="flex items-center justify-between gap-4">
      {page > 1 ? <Link href={href(page - 1)} prefetch={false} className={style}>Previous</Link> : <span />}
      <span className="text-sm text-[#777]">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)} prefetch={false} className={style}>Next</Link> : <span />}
    </nav>
  );
}
