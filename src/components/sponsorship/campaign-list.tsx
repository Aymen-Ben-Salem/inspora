"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { NavbarMenu } from "@/components/navbar-menu";
import { useEffect, useState } from "react";
import type { OwnedCampaign } from "@/features/sponsorship/types";
import { sponsorRequest } from "./upload-operations";
const button =
  "focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-[#e6e6e6] px-4 py-2 text-sm transition-colors hover:bg-[#fafafa] disabled:opacity-40";
export function CampaignList({
  initial,
  paused = false,
  forceReadonly = false,
}: {
  initial: { campaigns: OwnedCampaign[]; readonly: boolean };
  paused?: boolean;
  forceReadonly?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "publish" | "delete";
    campaign: OwnedCampaign;
  }>();
  const current = data.campaigns.find((c) => c.state === "published");
  const readonly = forceReadonly || data.readonly;
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    setData(initial);
  }
  async function apply() {
    if (!confirm || readonly || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { campaign, kind } = confirm;
      await sponsorRequest(
        `campaigns/${campaign.id}${kind === "publish" ? "/publish" : ""}`,
        kind === "publish" ? "POST" : "DELETE",
        { expectedRevision: campaign.revision },
      );
      window.dispatchEvent(new Event("sponsorship-changed"));
      router.refresh();
      setData(await sponsorRequest("campaigns", "GET"));
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
  const drafts = data.campaigns.filter(c => c.state === "draft" || c.state === "prepared").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm leading-6 text-[#767676]">
          {readonly
            ? "Your campaign history is read-only. Your past creative stays available to view."
            : "Manage your creative in one place. One campaign is public at a time; drafts stay private."}
        </p>
        {!readonly && <Link prefetch className={`${button} shrink-0 bg-[#262626] text-white hover:bg-[#404040]`} href={"/sponsor/campaigns/new" as Route}>Create campaign</Link>}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: paused ? "Promotion paused" : "Published campaign", value: current?.creative.title || "None yet", detail: current ? paused ? "Your creative is saved" : "Navbar, feed and detail placements" : "Publish a draft when you're ready" },
          { label: "Private drafts", value: drafts, detail: "Not visible to visitors" },
          { label: "Previous campaigns", value: data.campaigns.filter(c => c.state === "archived").length, detail: "Your creative history" },
        ].map(item => <div key={item.label} className="min-w-0 rounded-md border border-[#f0f0f0] bg-white p-5 first:col-span-2 sm:first:col-span-1">
          <dt className="text-xs text-[#767676]">{item.label}</dt>
          <dd className="mt-3 truncate text-xl font-medium tracking-[-0.02em]" title={String(item.value)}>{item.value}</dd>
          <dd className="mt-2 text-xs leading-5 text-[#767676]">{item.detail}</dd>
        </div>)}
      </dl>
      <section aria-labelledby="campaign-library-title" className="rounded-md border border-[#f0f0f0] bg-white">
        <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-5 sm:px-5">
          <h2 id="campaign-library-title" className="text-lg font-medium">All campaigns</h2>
          <span className="rounded bg-[#f5f5f5] px-2 py-1 text-xs tabular-nums text-[#767676]">{data.campaigns.length}</span>
        </div>
        <ul className="divide-y divide-[#f0f0f0]">
          {data.campaigns.map(c => {
            const thumbnail = c.creative.assets.find(asset => asset.id === (c.creative.posterId || c.creative.mediaId || c.creative.iconId));
            return <li key={c.id}>
              <div className="grid min-w-0 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_112px_320px] xl:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-[#fafafa] text-xl text-[#999] sm:h-20 sm:w-28">
                    {thumbnail && thumbnail.contentType.startsWith("image/") ? <Image src={thumbnail.url} alt="" fill unoptimized sizes="112px" className="object-cover" /> : <span aria-hidden="true">{c.creative.title.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0">
                    <Link prefetch href={`/sponsor/campaigns/${c.id}` as Route} className="focus-ring block break-words text-sm font-medium leading-6 hover:underline">{c.creative.title}</Link>
                    {c.creative.tagline && <p className="mt-1 truncate text-xs text-[#767676]" title={c.creative.tagline}>{c.creative.tagline}</p>}
                    <p className="mt-1 truncate text-xs text-[#767676]" title={c.creative.url}>{c.creative.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 xl:block">
                  <span className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs ${c.state === "published" ? "bg-[#f0f0f0] text-[#262626]" : "bg-[#fafafa] text-[#767676]"}`}>
                    {c.state === "published" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
                    {c.state === "published" ? paused ? "Paused" : "Published" : c.state === "archived" ? "Previous" : "Draft"}
                  </span>
                  <p className="text-xs text-[#767676] xl:mt-2 xl:px-2">Version {c.revision}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Link prefetch href={`/sponsor/campaigns/${c.id}` as Route} className={button}>{readonly ? "View campaign" : "Edit campaign"}</Link>
                  {!readonly && c.state !== "published" && <>
                    <button type="button" className={button} disabled={busy} onClick={() => setConfirm({kind:"publish",campaign:c})}>Make public</button>
                    {!busy && <NavbarMenu label={`More actions for ${c.creative.title}`} trigger={<span aria-hidden="true">···</span>} triggerClassName="flex size-11 items-center justify-center rounded-md text-lg hover:bg-[#f0f0f0]" menuClassName="right-0 w-44" keepInViewport items={[{label:"Delete campaign",onSelect:()=>setConfirm({kind:"delete",campaign:c})}]} />}
                  </>}
                </div>
              </div>
          {!readonly && confirm?.campaign.id === c.id && (
            <section
              role="dialog"
              aria-modal="false"
              aria-labelledby="campaign-confirm-title"
              className="m-4 rounded-md border border-[#e6e6e6] bg-[#fafafa] p-5 sm:m-5"
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
            </li>;
          })}
        </ul>
        {!data.campaigns.length && <div className="px-5 py-12 text-center">
          <h3 className="text-base font-medium">No saved campaigns yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#767676]">{readonly ? "Your saved campaigns will appear here." : "Create your first draft to preview your creative across all three placements."}</p>
        </div>}
      </section>
      <p role="status" aria-live="polite" className="text-sm text-[#767676]">{message}</p>
    </div>
  );
}

// Mounted only while Campaigns is selected. The protected endpoint remains the
// authority for campaign ownership, assets, revisions and read-only access.
export function CampaignsPanel({ ownerUserId, readonly, paused }: { ownerUserId: string; readonly: boolean; paused: boolean }) {
  const [data, setData] = useState<{ownerUserId: string; campaigns: OwnedCampaign[]; readonly: boolean} | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    sponsorRequest<NonNullable<typeof data>>("campaigns", "GET", undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.ownerUserId !== ownerUserId) throw new Error("Your account changed. Reload the dashboard to continue.");
        setData(result);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Campaigns could not be loaded."); });
    return () => controller.abort();
  }, [ownerUserId, attempt]);
  if (error) return <div className="rounded-md border border-[#f0f0f0] p-5"><p role="alert" className="text-sm text-[#767676]">{error}</p><button type="button" className={`${button} mt-4`} onClick={() => {setError(""); setAttempt(value => value + 1);}}>Try again</button></div>;
  if (!data) return <p role="status" className="py-8 text-sm text-[#767676]">Loading campaigns…</p>;
  return <CampaignList initial={data} forceReadonly={readonly} paused={paused} />;
}
