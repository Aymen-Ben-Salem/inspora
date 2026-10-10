"use client";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { OwnedCampaign } from "@/features/sponsorship/types";
import { sponsorRequest } from "./upload-operations";
import { CampaignPreview } from "./campaign-preview";
const button =
  "focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-[#e6e6e6] px-4 py-2 text-sm disabled:opacity-40";
export function CampaignList({
  initial,
}: {
  initial: { campaigns: OwnedCampaign[]; readonly: boolean };
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "publish" | "delete";
    campaign: OwnedCampaign;
  }>();
  const current = data.campaigns.find((c) => c.state === "published");
  async function apply() {
    if (!confirm || data.readonly || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { campaign, kind } = confirm;
      await sponsorRequest(
        `campaigns/${campaign.id}${kind === "publish" ? "/publish" : ""}`,
        kind === "publish" ? "POST" : "DELETE",
        { expectedRevision: campaign.revision },
      );
      setData(await sponsorRequest("campaigns", "GET"));
      window.dispatchEvent(new Event("sponsorship-changed"));
      setConfirm(undefined);
      setMessage(
        kind === "publish"
          ? "Campaign is public. All three placements use this creative."
          : "Campaign deleted. Referenced history is retained.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Campaign unavailable. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto min-h-[80dvh] max-w-[1120px] px-4 pb-20 pt-12 text-[#262626] sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#767676]">Your sponsorship</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Campaigns
          </h1>
        </div>
        {!data.readonly && (
          <Link
            prefetch={false}
            className={`${button} bg-[#262626] text-white`}
            href={"/sponsor/campaigns/new" as Route}
          >
            Create campaign
          </Link>
        )}
      </div>
      <nav
        aria-label="Sponsorship"
        className="mt-6 flex gap-6 border-b border-[#f0f0f0] pb-4 text-sm"
      >
        <a className="focus-ring" href="/sponsor/dashboard">
          Overview
        </a>
        <Link
          prefetch={false}
          className="focus-ring font-medium"
          href={"/sponsor/campaigns" as Route}
          aria-current="page"
        >
          Campaigns
        </Link>
        <a className="focus-ring" href="/sponsor/dashboard#billing">
          Billing
        </a>
      </nav>
      <p className="mt-6 text-sm leading-6 text-[#767676]">
        {data.readonly
          ? "Your campaign history is read-only. Your past creative stays available to view."
          : "One campaign is public at a time. Drafts stay private until you make them public."}
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {data.campaigns.map((c) => (
            <section
              key={c.id}
              className="rounded-md border border-[#e6e6e6] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="break-words text-lg font-medium">
                  {c.creative.title}
                </h2>
                <span className="rounded bg-[#fafafa] px-2 py-1 text-xs capitalize text-[#767676]">
                  {c.state === "published"
                    ? "Published"
                    : c.state === "archived"
                      ? "Previous"
                      : "Draft"}{" "}
                  · version {c.revision}
                </span>
              </div>
              <p className="mt-2 break-all text-sm text-[#767676]">
                {c.creative.url}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  prefetch={false}
                  href={`/sponsor/campaigns/${c.id}` as Route}
                  className={button}
                >
                  {data.readonly ? "View campaign" : "Edit campaign"}
                </Link>
                {!data.readonly && c.state !== "published" && (
                  <>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ kind: "publish", campaign: c })
                      }
                    >
                      Make public
                    </button>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ kind: "delete", campaign: c })
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </section>
          ))}
          {!data.campaigns.length && (
            <p className="rounded-md bg-[#fafafa] p-6 text-sm text-[#767676]">
              No saved campaigns yet. Create your first draft to review all
              three placements.
            </p>
          )}
          {confirm && (
            <section
              role="dialog"
              aria-modal="false"
              aria-labelledby="campaign-confirm-title"
              className="rounded-md border border-[#262626] bg-[#fafafa] p-5"
            >
              <h2 id="campaign-confirm-title" className="font-medium">
                {confirm.kind === "publish"
                  ? `Make “${confirm.campaign.creative.title}” public?`
                  : `Delete “${confirm.campaign.creative.title}”?`}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#767676]">
                {confirm.kind === "publish"
                  ? current
                    ? `This replaces “${current.creative.title}” across the navbar, feed and detail wordmarks. All creative and the destination change together.`
                    : "This campaign will appear across the navbar, feed and detail wordmarks."
                  : "This removes the campaign from your list. Previous versions and referenced assets remain in history."}
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  className={`${button} bg-[#262626] text-white`}
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {busy
                    ? "Saving…"
                    : confirm.kind === "publish"
                      ? "Confirm replacement"
                      : "Confirm deletion"}
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => setConfirm(undefined)}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-[#767676]"
          >
            {message}
          </p>
        </div>
        {current && (
          <CampaignPreview
            paid
            assets={current.creative.assets}
            fields={{
              ...current.creative,
              mediaId: current.creative.mediaId ?? "",
              posterId: current.creative.posterId ?? "",
              videoPreviewId: current.creative.videoPreviewId ?? "",
            }}
          />
        )}
      </div>
    </main>
  );
}
