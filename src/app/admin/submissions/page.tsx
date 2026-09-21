import type { Route } from "next";
import Link from "next/link";

import { getSubmissionReviewQueue } from "../../../features/submissions/review-service";

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string; rejected?: string }>;
}) {
  const [{ accepted, rejected }, submissions] = await Promise.all([
    searchParams,
    getSubmissionReviewQueue(),
  ]);
  const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-black/10 pb-7">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Editorial queue</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Submissions</h1>
          <p className="mt-3 text-sm text-[#777]">{submissions.length} awaiting review</p>
        </div>
        {accepted || rejected ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {accepted ? "Submission accepted and published." : "Submission rejected."}
          </p>
        ) : null}
      </header>

      {submissions.length === 0 ? (
        <section className="rounded-2xl border border-black/10 bg-white px-6 py-20 text-center">
          <h2 className="text-xl font-medium tracking-[-0.03em]">The review queue is clear.</h2>
          <p className="mt-2 text-sm text-[#777]">New private submissions will appear here.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white" aria-label="Submission review queue">
          {submissions.map((submission) => (
            <Link
              key={submission.id}
              href={`/admin/submissions/${submission.id}` as Route}
              className="focus-ring grid gap-3 border-b border-black/10 px-5 py-5 transition-colors last:border-b-0 hover:bg-[#f7f7f4] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{submission.kind === "app-icon" ? "App Icon" : submission.kind[0]!.toUpperCase() + submission.kind.slice(1)}</h2>
                  <span className="rounded-full bg-[#f3e9ce] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#795d18]">In review</span>
                </div>
                <p className="mt-1 truncate text-sm text-[#666]">
                  Submitter: {submission.creatorName}{submission.creatorUsername ? ` (@${submission.creatorUsername})` : ""}
                </p>
                <p className="mt-2 truncate text-xs text-[#888]">
                  {submission.sourceUrl ?? `${submission.mediaType ?? "Uploaded file"} · private source`}
                </p>
              </div>
              <time className="text-xs text-[#777]" dateTime={submission.createdAt}>
                {dateFormatter.format(new Date(submission.createdAt))}
              </time>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
