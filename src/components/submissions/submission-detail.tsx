"use client";

import { useState, useTransition } from "react";

import { withdrawOwnSubmission } from "../../features/submissions/actions";
import { ProfileModal } from "../profile/profile-modal";
import type { OwnProfileSubmission } from "../../features/profiles/messages-repository";
import { runOptimisticWithdrawal } from "./withdrawal-ui";

const kindLabels = {
  design: "Design",
  logo: "Logo",
  website: "Website",
  "app-icon": "App Icon",
} as const;

export function SubmissionDetail({
  onDismiss,
  onOptimisticWithdraw = () => undefined,
  onRollbackWithdraw = () => undefined,
  open,
  submission,
}: {
  onDismiss: () => void;
  onOptimisticWithdraw?: (id: string) => void;
  onRollbackWithdraw?: (id: string) => void;
  open: boolean;
  submission: OwnProfileSubmission;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [withdrawing, startWithdrawal] = useTransition();
  const rejected = submission.status === "rejected";
  return (
    <ProfileModal open={open} label={`${kindLabels[submission.kind]} submission`} onDismiss={onDismiss}>
      <div className="mt-7">
        {submission.source === "upload" ? (
          submission.mediaType?.startsWith("video/") ? (
            <video controls playsInline src={`/api/submissions/${submission.id}/media`} className="max-h-[50dvh] w-full rounded-[3px] bg-[#f3f3f3] object-contain" />
          ) : (
            // This is an authenticated, no-store source and intentionally bypasses optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/submissions/${submission.id}/media`} alt="Private submission" className="max-h-[50dvh] w-full rounded-[3px] bg-[#f3f3f3] object-contain" />
          )
        ) : submission.sourceUrl ? (
          <a href={submission.sourceUrl} target="_blank" rel="noreferrer" className="focus-ring block break-all rounded-[3px] border border-[#e6e6e6] bg-[#fcfcfc] px-4 py-4 text-sm text-[#262626] underline underline-offset-2">
            {submission.sourceUrl}
          </a>
        ) : null}

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4"><dt className="text-[#767676]">Status</dt><dd className={rejected ? "text-[#b42318]" : "text-[#262626]"}>{rejected ? "Not accepted" : "In Review"}</dd></div>
          <div className="flex items-start justify-between gap-4"><dt className="text-[#767676]">Submitted</dt><dd className="text-right text-[#262626]">{new Date(submission.createdAt).toLocaleString()}</dd></div>
          {rejected && submission.rejectionReason ? (
            <div className="border-t border-[#e6e6e6] pt-3"><dt className="text-[#767676]">Review note</dt><dd className="mt-2 text-[#262626]">{submission.rejectionReason}</dd></div>
          ) : null}
          {rejected && submission.rejectionExpiresAt ? (
            <div className="flex items-start justify-between gap-4"><dt className="text-[#767676]">Removed after</dt><dd className="text-right text-[#262626]">{new Date(submission.rejectionExpiresAt).toLocaleString()}</dd></div>
          ) : null}
        </dl>

        {!rejected ? confirming ? (
          <div className="mt-8 rounded-[3px] border border-[#febbbb] bg-[rgba(239,148,148,0.07)] p-4">
            <p className="text-sm text-[#262626]">Withdraw this submission?</p>
            <p className="mt-1 text-xs text-[#767676]">It will leave the review queue immediately and its private upload will be deleted.</p>
            {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
            <div className="mt-4 flex gap-3">
              <button type="button" disabled={withdrawing} onClick={() => { setConfirming(false); setError(undefined); }} className="focus-ring min-h-11 cursor-pointer rounded-lg border border-[#e6e6e6] px-5 text-sm text-[#262626] disabled:cursor-not-allowed disabled:opacity-50">
                Keep submission
              </button>
              <button type="button" disabled={withdrawing} onClick={() => {
                setError(undefined);
                startWithdrawal(async () => {
                  const result = await runOptimisticWithdrawal({
                    id: submission.id,
                    withdraw: withdrawOwnSubmission,
                    hide: onOptimisticWithdraw,
                    restore: onRollbackWithdraw,
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  onDismiss();
                });
              }} className="focus-ring min-h-11 cursor-pointer rounded-lg bg-[#262626] px-5 text-sm text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
                {withdrawing ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="focus-ring mt-8 min-h-11 cursor-pointer rounded-lg border border-[#e6e6e6] px-5 text-sm text-[#262626] transition-colors hover:border-[#262626] hover:bg-[#262626] hover:text-white">
            Withdraw
          </button>
        ) : null}
      </div>
    </ProfileModal>
  );
}
