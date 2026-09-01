import type { Route } from "next";
import Link from "next/link";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { archiveWebsiteAction, deleteWebsiteAction } from "@/features/admin/actions";
import { getAdminWebsites } from "@/features/admin/websites-repository";

const statusStyles = {
  published: "bg-[#dcebdd] text-[#315f37]",
  draft: "bg-[#f3e9ce] text-[#795d18]",
  archived: "bg-[#e7e7e4] text-[#696965]",
} as const;

export default async function AdminWebsitesPage() {
  const websites = await getAdminWebsites();
  const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const statusCounts = websites.reduce(
    (counts, website) => ({ ...counts, [website.status]: counts[website.status] + 1 }),
    { published: 0, draft: 0, archived: 0 },
  );

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Websites</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#777]">
            <span>{websites.length} total</span>
            <span>{statusCounts.published} published</span>
            <span>{statusCounts.draft} drafts</span>
            {statusCounts.archived ? <span>{statusCounts.archived} archived</span> : null}
          </div>
        </div>
        <Link href={"/admin/websites/new" as Route} className="focus-ring inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-[#252525]">New website</Link>
      </header>

      {websites.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white px-6 py-20 text-center">
          <p className="text-lg font-medium">No websites yet.</p>
          <p className="mt-2 text-sm text-[#777]">Create the first website in the archive.</p>
        </div>
      ) : (
        <section aria-label="Website library" className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">
          {websites.map((website) => {
            const fullPage = website.media.find((media) => media.role === "full_page");
            return (
              <article key={website.id} className="group flex min-w-0 flex-col bg-white">
                <Link href={`/admin/websites/${website.id}/edit` as Route} className="focus-ring aspect-[1080/659] overflow-hidden bg-[#ececea]">
                  {fullPage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fullPage.url} alt={fullPage.alt} className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.015]" />
                  ) : null}
                </Link>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><h2 className="truncate text-xl font-medium">{website.title}</h2><p className="mt-1 truncate text-sm text-[#777]">by {website.creator.name}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${statusStyles[website.status]}`}>{website.status}</span>
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm text-[#777]">{website.tagline}</p>
                  <p className="mt-4 text-xs text-[#777]">Created {dateFormatter.format(new Date(website.createdAt))}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                    <Link href={`/admin/websites/${website.id}/edit` as Route} className="focus-ring rounded-full bg-black px-4 py-2 text-sm text-white">Edit</Link>
                    {website.status === "published" ? <Link href={`/websites?website=${website.slug}` as Route} target="_blank" className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm">View live</Link> : null}
                    <div className="ml-auto">
                      {website.status !== "archived" ? (
                        <form action={archiveWebsiteAction}><input type="hidden" name="id" value={website.id} /><ConfirmButton confirmation={`Archive “${website.title}”? It will disappear from the public websites page.`} className="focus-ring px-2 py-2 text-xs text-[#777]">Archive</ConfirmButton></form>
                      ) : (
                        <form action={deleteWebsiteAction}><input type="hidden" name="id" value={website.id} /><ConfirmButton confirmation={`Permanently delete “${website.title}” and its media? This cannot be undone.`} className="focus-ring px-2 py-2 text-xs text-red-700">Delete permanently</ConfirmButton></form>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
