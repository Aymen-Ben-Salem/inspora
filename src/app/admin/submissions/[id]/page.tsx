import { notFound } from "next/navigation";

import { SubmissionReview } from "../../../../components/admin/submission-review";
import {
  acceptAndPublishAction,
  rejectSubmissionAction,
} from "../../../../features/admin/submission-actions";
import { getAdminCreators } from "../../../../features/creators/repository";
import { getSubmissionReviewById } from "../../../../features/submissions/review-service";

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [submission, creators] = await Promise.all([
    getSubmissionReviewById(id),
    getAdminCreators(),
  ]);
  if (!submission) notFound();
  const creator = creators.find((candidate) => candidate.id === submission.creatorId);
  if (!creator) notFound();

  return (
    <div className="grid gap-7">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Submissions</p>
        <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Review submission</h1>
      </header>
      <SubmissionReview
        submission={submission}
        creator={creator}
        creators={creators}
        acceptAction={acceptAndPublishAction.bind(null, submission.id)}
        rejectAction={rejectSubmissionAction.bind(null, submission.id)}
      />
    </div>
  );
}
