"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";

import type { AdminSubmissionReview } from "../../features/submissions/review-service";
import {
  initialAdminActionState,
  type AdminActionState,
  type AdminCreatorRecord,
  type AdminLogoRecord,
  type AdminPostRecord,
  type AdminWebsiteRecord,
} from "../../features/admin/types";
import { LogoEditor } from "./logo-editor";
import { PostEditor } from "./post-editor";
import { WebsiteEditor } from "./website-editor";

type ReviewAction = (
  state: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

function sourceLabel(kind: AdminSubmissionReview["kind"]) {
  if (kind === "app-icon") return "App Icon";
  return kind[0]!.toUpperCase() + kind.slice(1);
}

function postDraft(
  submission: AdminSubmissionReview,
  creator: AdminCreatorRecord,
): AdminPostRecord {
  return {
    id: submission.id,
    slug: "",
    title: "",
    creator,
    description: "",
    category: "Product",
    industries: [],
    colors: [],
    styles: [],
    sourceUrl: submission.sourceUrl ?? "",
    isFeatured: false,
    status: "draft",
    media: [],
    createdAt: submission.createdAt,
    updatedAt: submission.createdAt,
  };
}

function logoDraft(
  submission: AdminSubmissionReview,
  creator: AdminCreatorRecord,
): AdminLogoRecord {
  return {
    id: submission.id,
    slug: "",
    title: "",
    kind: submission.kind === "app-icon" ? "icon" : "logo",
    creator,
    description: "",
    industry: "",
    colors: [],
    styles: [],
    shape: submission.kind === "app-icon" ? "Square" : "",
    sourceUrl: submission.sourceUrl ?? "",
    status: "draft",
    media: { url: "", alt: "", width: 1080, height: 659 },
    createdAt: submission.createdAt,
    updatedAt: submission.createdAt,
  };
}

function websiteDraft(
  submission: AdminSubmissionReview,
  creator: AdminCreatorRecord,
): AdminWebsiteRecord {
  return {
    id: submission.id,
    slug: "",
    title: "",
    tagline: "",
    creator,
    description: "",
    categories: [],
    themes: [],
    colors: [],
    sourceUrl: submission.sourceUrl ?? "",
    isFeatured: false,
    status: "draft",
    media: [],
    sections: [],
    createdAt: submission.createdAt,
    updatedAt: submission.createdAt,
  };
}

function RejectForm({ action }: { action: ReviewAction }) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialAdminActionState,
  );
  return (
    <form action={formAction} className="grid gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-red-700">Reject submission</p>
        <p className="mt-2 text-sm leading-6 text-red-900">
          The reason is shown privately to the submitter for 48 hours.
        </p>
      </div>
      {state.status === "error" ? <p role="alert" className="text-sm text-red-800">{state.message}</p> : null}
      <label className="grid gap-2 text-sm font-medium text-red-950">
        Reason
        <textarea
          name="reason"
          required
          maxLength={2000}
          className="focus-ring min-h-28 resize-y rounded-xl border border-red-200 bg-white px-3 py-3 text-sm outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="focus-ring h-11 rounded-full bg-red-700 px-5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-55"
      >
        {isPending ? "Rejecting..." : "Reject with reason"}
      </button>
    </form>
  );
}

export function SubmissionReview({
  submission,
  creator,
  creators,
  acceptAction,
  rejectAction,
}: {
  submission: AdminSubmissionReview;
  creator: AdminCreatorRecord;
  creators: AdminCreatorRecord[];
  acceptAction: ReviewAction;
  rejectAction: ReviewAction;
}) {
  const submittedAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(submission.createdAt));
  const cancelHref = "/admin/submissions" as Route;

  return (
    <div className="grid gap-7">
      <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#777]">Submitted source</p>
            <h2 className="mt-1 text-2xl font-medium tracking-[-0.035em]">{sourceLabel(submission.kind)}</h2>
            <p className="mt-2 text-sm text-[#666]">
              Submitter: {creator.name}{creator.username ? ` (@${creator.username})` : ""} · {submittedAt}
            </p>
          </div>
          <span className="rounded-full bg-[#f3e9ce] px-3 py-1.5 text-xs font-medium text-[#795d18]">
            {submission.status.replace("_", " ")}
          </span>
        </div>
        <p className="rounded-xl bg-[#f5f5f2] px-4 py-3 text-sm text-[#555]">
          Publication credit is fixed to {creator.name}. Creator fields in the editor cannot change the submission owner.
        </p>
        {submission.sourceUrl ? (
          <a
            href={submission.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring break-all rounded-xl border border-black/10 px-4 py-3 text-sm underline-offset-4 hover:underline"
          >
            {submission.sourceUrl}
          </a>
        ) : submission.mediaHref ? (
          submission.mediaType?.startsWith("video/") ? (
            <video src={submission.mediaHref} controls className="max-h-[560px] w-full rounded-xl bg-black object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={submission.mediaHref} alt="Private submitted source" className="max-h-[560px] w-full rounded-xl bg-[#ececea] object-contain" />
          )
        ) : (
          <p className="text-sm text-[#777]">No source preview is available.</p>
        )}
      </section>

      {submission.status === "accepted" && submission.publishedRef ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          This submission is published. <Link className="underline" href={submission.publishedRef.href as Route}>Open the work</Link>.
        </section>
      ) : null}
      {submission.status === "rejected" ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          Rejected: {submission.rejectionReason} {submission.expiresAt ? `This private record expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.expiresAt))}.` : null}
        </section>
      ) : null}

      {submission.status === "in_review" ? (
        <>
          {submission.kind === "design" ? (
            <PostEditor action={acceptAction} creators={creators} post={postDraft(submission, creator)} lockExistingCreators actionLabel="Accept and publish" cancelHref={cancelHref} publicationOnly />
          ) : submission.kind === "website" ? (
            <WebsiteEditor action={acceptAction} creators={creators} website={websiteDraft(submission, creator)} lockExistingCreators actionLabel="Accept and publish" cancelHref={cancelHref} publicationOnly />
          ) : (
            <LogoEditor action={acceptAction} creators={creators} logo={logoDraft(submission, creator)} lockExistingCreators actionLabel="Accept and publish" cancelHref={cancelHref} publicationOnly />
          )}
          <RejectForm action={rejectAction} />
        </>
      ) : null}
    </div>
  );
}
