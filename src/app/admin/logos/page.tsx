import type { Route } from "next";
import Link from "next/link";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { archiveLogoAction, deleteLogoAction } from "@/features/admin/actions";
import { getAdminLogos } from "@/features/admin/logos-repository";

const statusStyles = {
  published: "bg-[#dcebdd] text-[#315f37]",
  draft: "bg-[#f3e9ce] text-[#795d18]",
  archived: "bg-[#e7e7e4] text-[#696965]",
} as const;

export default async function AdminLogosPage() {
  const logos = await getAdminLogos();
  const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const statusCounts = logos.reduce(
    (counts, logo) => ({ ...counts, [logo.status]: counts[logo.status] + 1 }),
    { published: 0, draft: 0, archived: 0 },
  );

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Logos</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#777]">
            <span>{logos.length} total</span>
            <span>{statusCounts.published} published</span>
            <span>{statusCounts.draft} drafts</span>
            {statusCounts.archived ? <span>{statusCounts.archived} archived</span> : null}
          </div>
        </div>
        <Link
          href={"/admin/logos/new" as Route}
          className="focus-ring inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#252525]"
        >
          New logo
        </Link>
      </header>

      {logos.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white px-6 py-20 text-center">
          <p className="text-lg font-medium tracking-[-0.02em]">No logos yet.</p>
          <p className="mt-2 text-sm text-[#777]">
            Create the first logo or icon in the archive.
          </p>
        </div>
      ) : (
        <section
          aria-label="Logo library"
          className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3"
        >
          {logos.map((logo) => (
            <article key={logo.id} className="group flex min-w-0 flex-col bg-white">
              <Link
                href={`/admin/logos/${logo.id}/edit` as Route}
                aria-label={`Edit ${logo.title}`}
                className="focus-ring flex aspect-[16/10] items-center justify-center overflow-hidden bg-[#ececea] p-7"
              >
                {/* Admin media URLs may precede Next image host configuration. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.media.url}
                  alt={logo.media.alt || `${logo.title} preview`}
                  loading="lazy"
                  className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]"
                />
              </Link>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-medium tracking-[-0.035em]">
                      {logo.title}
                    </h2>
                    <p className="mt-1 truncate text-sm text-[#777]">
                      by {logo.creator.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <span className="rounded-full bg-[#efefec] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#555]">
                      {logo.kind}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${statusStyles[logo.status]}`}
                    >
                      {logo.status}
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#777]">
                  <span>{logo.industry}</span>
                  <span aria-hidden="true">·</span>
                  <span>Created {dateFormatter.format(new Date(logo.createdAt))}</span>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <Link
                    href={`/admin/logos/${logo.id}/edit` as Route}
                    className="focus-ring rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#252525]"
                  >
                    Edit
                  </Link>
                  {logo.status === "published" ? (
                    <Link
                      href={`/logos?logo=${logo.slug}` as Route}
                      target="_blank"
                      className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm transition-colors hover:bg-[#f3f3f1]"
                    >
                      View live
                    </Link>
                  ) : null}
                  <div className="ml-auto">
                    {logo.status !== "archived" ? (
                      <form action={archiveLogoAction}>
                        <input type="hidden" name="id" value={logo.id} />
                        <ConfirmButton
                          confirmation={`Archive “${logo.title}”? It will disappear from the public logos page.`}
                          className="focus-ring px-2 py-2 text-xs text-[#777] underline-offset-4 hover:text-black hover:underline"
                        >
                          Archive
                        </ConfirmButton>
                      </form>
                    ) : (
                      <form action={deleteLogoAction}>
                        <input type="hidden" name="id" value={logo.id} />
                        <ConfirmButton
                          confirmation={`Permanently delete “${logo.title}” and its image? This cannot be undone.`}
                          className="focus-ring px-2 py-2 text-xs text-red-700 underline-offset-4 hover:underline"
                        >
                          Delete permanently
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
