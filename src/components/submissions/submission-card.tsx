import Image from "next/image";

import type { OwnProfileSubmission } from "../../features/profiles/messages-repository";

const kindLabels = {
  design: "Design",
  logo: "Logo",
  website: "Website",
  "app-icon": "App Icon",
} as const;

export function SubmissionCard({
  onSelect,
  submission,
}: {
  onSelect: () => void;
  submission: OwnProfileSubmission;
}) {
  const inReview = submission.status === "in_review";
  return (
    <button
      type="button"
      onClick={onSelect}
      className="focus-ring group w-full overflow-hidden rounded-[3px] border border-[#e6e6e6] bg-[#fafafa] text-left"
    >
      <div className="relative aspect-[1.36/1] overflow-hidden bg-[#f3f3f3]">
        {submission.source === "upload" && submission.mediaType?.startsWith("image/") ? (
          <Image
            unoptimized
            fill
            src={`/api/submissions/${submission.id}/media`}
            alt="Private submission preview"
            className="scale-105 object-cover blur-[16px]"
            sizes="(max-width: 640px) 100vw, 25vw"
          />
        ) : submission.source === "upload" && submission.mediaType?.startsWith("video/") ? (
          <video
            src={`/api/submissions/${submission.id}/media`}
            muted
            playsInline
            className="size-full scale-105 object-cover blur-[16px]"
          />
        ) : (
          <div className="grid size-full place-items-center px-5 text-center">
            <div>
              <p className="text-sm font-medium text-[#262626]">{kindLabels[submission.kind]}</p>
              <p className="mt-1 text-xs text-[#767676]">{submission.sourceDomain}</p>
            </div>
          </div>
        )}
        {inReview ? (
          <span className="absolute inset-x-3 bottom-3 rounded-[3px] bg-white/90 px-3 py-2 text-center text-xs font-medium text-[#262626] backdrop-blur-sm">
            In Review
          </span>
        ) : null}
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-[#262626]">{kindLabels[submission.kind]}</p>
        {!inReview ? <p className="mt-1 text-xs text-[#b42318]">Not accepted</p> : null}
      </div>
    </button>
  );
}
