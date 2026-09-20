"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";

import { dismissOwnProfileMessage } from "../../features/profiles/messages";
import type { OwnProfileMessage } from "../../features/profiles/messages-repository";

const labels = {
  submission_accepted: "Submission accepted",
  claim_approved: "Creator claim approved",
  claim_rejected: "Creator claim not approved",
} as const;

export function ProfileMessages({ messages }: { messages: OwnProfileMessage[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = messages.filter((message) => !dismissed.includes(message.id));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (visible.length === 0) return null;

  return (
    <section aria-label="Profile messages" className="archive-frame mt-8 space-y-2">
      {visible.map((message) => (
        <article key={message.id} className="flex items-center justify-between gap-4 rounded-[3px] border border-[#e6e6e6] bg-[#fcfcfc] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[#262626]">{labels[message.kind]}</p>
            {message.kind === "submission_accepted" && message.publishedHref ? (
              <Link href={message.publishedHref as Route} className="focus-ring mt-1 inline-block text-xs text-[#767676] underline underline-offset-2">
                View published work
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            disabled={pending}
            className="focus-ring shrink-0 text-xs text-[#767676] disabled:opacity-50"
            onClick={() => startTransition(async () => {
              setError(undefined);
              const result = await dismissOwnProfileMessage(message.id);
              if (result.ok) {
                setDismissed((current) => [...current, message.id]);
              } else {
                setError(result.message);
              }
            })}
          >
            Dismiss
          </button>
        </article>
      ))}
      {error ? <p role="alert" className="text-xs text-[#b42318]">{error}</p> : null}
    </section>
  );
}
