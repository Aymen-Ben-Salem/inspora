import type { Route } from "next";
import Link from "next/link";

import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  deleteSubscriberAction,
  unsubscribeSubscriberAction,
} from "@/features/admin/actions";
import { getAdminSubscribers } from "@/features/admin/subscribers-repository";

type SubscribersPageProps = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

function pageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return `/admin/subscribers?${params.toString()}` as Route;
}

export default async function SubscribersPage({ searchParams }: SubscribersPageProps) {
  const raw = await searchParams;
  const query = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim().slice(0, 254) ?? "";
  const pageValue = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const requestedPage = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const result = await getAdminSubscribers({ query, page: requestedPage });
  const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Audience</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Subscribers</h1>
          <p className="mt-2 text-sm text-[#777]">{result.total} matching subscribers</p>
        </div>
        <form action="/admin/subscribers/export" method="post">
          <button className="focus-ring h-11 rounded-full border border-black/10 bg-white px-5 text-sm font-medium transition-colors hover:bg-[#eeeeeb]">
            Export CSV
          </button>
        </form>
      </div>

      <form className="flex max-w-xl gap-2" method="get">
        <label className="sr-only" htmlFor="subscriber-search">Search subscribers</label>
        <input
          id="subscriber-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by email"
          className="focus-ring h-11 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 outline-none placeholder:text-[#aaa]"
        />
        <button className="focus-ring h-11 rounded-full bg-black px-5 text-sm font-medium text-white">
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
        {result.rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-[#777]">No subscribers found.</div>
        ) : (
          <div className="divide-y divide-black/10">
            {result.rows.map((subscriber) => (
              <article
                key={subscriber.id}
                className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-medium">{subscriber.email}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
                        subscriber.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-[#e5e5e5] text-[#666]"
                      }`}
                    >
                      {subscriber.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#777]">
                    {subscriber.source} · Consented {dateFormatter.format(subscriber.consentedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {subscriber.status === "active" ? (
                    <form action={unsubscribeSubscriberAction}>
                      <input type="hidden" name="id" value={subscriber.id} />
                      <ConfirmButton
                        confirmation={`Mark ${subscriber.email} as unsubscribed?`}
                        className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm text-[#666] transition-colors hover:bg-[#f3f3f3] hover:text-black"
                      >
                        Unsubscribe
                      </ConfirmButton>
                    </form>
                  ) : null}
                  <form action={deleteSubscriberAction}>
                    <input type="hidden" name="id" value={subscriber.id} />
                    <ConfirmButton
                      confirmation={`Permanently erase ${subscriber.email}? This cannot be undone.`}
                      className="focus-ring rounded-full border border-red-200 px-4 py-2 text-sm text-red-700 transition-colors hover:bg-red-50"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {result.totalPages > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Subscriber pages">
          {result.page > 1 ? (
            <Link prefetch={false} href={pageHref(result.page - 1, query)} className="focus-ring rounded-full border border-black/10 bg-white px-4 py-2 text-sm">
              Previous
            </Link>
          ) : <span />}
          <span className="text-sm text-[#777]">Page {result.page} of {result.totalPages}</span>
          {result.page < result.totalPages ? (
            <Link prefetch={false} href={pageHref(result.page + 1, query)} className="focus-ring rounded-full border border-black/10 bg-white px-4 py-2 text-sm">
              Next
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
