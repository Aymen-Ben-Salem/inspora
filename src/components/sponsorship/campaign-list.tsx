"use client";
import { sponsorButton } from "./button-styles";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { OwnedCampaign } from "@/features/sponsorship/types";
import { sponsorRequest } from "./upload-operations";
import { DashboardIcon, type DashboardIconName } from "./dashboard-icon";
import styles from "./dashboard.module.css";

const primaryButton = `${sponsorButton.primary} ${styles.primaryButton}`;
const secondaryButton = `${sponsorButton.secondary} ${styles.secondaryButton}`;

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
        <p className="max-w-xl text-sm leading-6 text-[#66758c]">
          {readonly
            ? "Your campaign history is read-only. Your past creative stays available to view."
            : "Manage your creative in one place. One campaign is public at a time; drafts stay private."}
        </p>
        {!readonly && <Link prefetch className={`${primaryButton} shrink-0`} href={"/sponsor/campaigns/new" as Route}><DashboardIcon name="plus" />Create campaign</Link>}
      </div>
      <dl className={styles.summaryGrid}>
        {[
          { icon: "eye", label: paused ? "Promotion paused" : "Published campaign", value: current?.creative.title || "None yet", detail: current ? paused ? "Your creative is saved" : "Navbar, feed and detail placements" : "Publish a draft when you're ready" },
          { icon: "draft", label: "Private drafts", value: drafts, detail: "Not visible to visitors" },
          { icon: "archive", label: "Previous campaigns", value: data.campaigns.filter(c => c.state === "archived").length, detail: "Your creative history" },
        ].map(item => <div key={item.label} className={styles.metric}>
          <dt className={styles.metricHeader}>{item.label}<span className={styles.metricIcon}><DashboardIcon name={item.icon as DashboardIconName} className="size-[18px]" /></span></dt>
          <dd className={`${styles.summaryValue} truncate`} title={String(item.value)}>{item.value}</dd>
          <dd className={`mt-2 text-xs leading-5 ${styles.muted}`}>{item.detail}</dd>
        </div>)}
      </dl>
      <section aria-labelledby="campaign-library-title" className={`${styles.surface} ${styles.library}`}>
        <div className={styles.libraryHeader}>
          <h2 id="campaign-library-title" className="text-lg font-medium">All campaigns</h2>
          <span className={`${styles.statusBadge} tabular-nums`}>{data.campaigns.length}</span>
        </div>
        <ul className="divide-y divide-[#e7ebf2]">
          {data.campaigns.map(c => {
            const thumbnail = c.creative.assets.find(asset => asset.id === (c.creative.posterId || c.creative.mediaId || c.creative.iconId));
            return <li key={c.id}>
              <div className={`${styles.campaignRow} grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_100px_320px] xl:items-center`}>
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`${styles.thumbnail} relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden sm:h-20 sm:w-28`}>
                    {thumbnail && thumbnail.contentType.startsWith("image/") ? <Image src={thumbnail.url} alt="" fill unoptimized sizes="112px" className="object-cover" /> : <DashboardIcon name="campaigns" className="size-6" />}
                  </div>
                  <div className="min-w-0">
                    <Link prefetch href={`/sponsor/campaigns/${c.id}` as Route} className="focus-ring block break-words text-sm font-medium leading-6 hover:underline">{c.creative.title}</Link>
                    {c.creative.tagline && <p className="mt-1 truncate text-xs text-[#66758c]" title={c.creative.tagline}>{c.creative.tagline}</p>}
                    <p className="mt-1 truncate text-xs text-[#66758c]" title={c.creative.url}>{c.creative.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 xl:block">
                  <span className={styles.statusBadge} data-active={c.state === "published" && !paused}>
                    {c.state === "published" && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
                    {c.state === "published" ? paused ? "Paused" : "Published" : c.state === "archived" ? "Previous" : "Draft"}
                  </span>
                  <p className="text-xs text-[#66758c] xl:mt-2 xl:px-2">Version {c.revision}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Link prefetch href={`/sponsor/campaigns/${c.id}` as Route} className={secondaryButton}>{readonly ? "View campaign" : "Edit campaign"}</Link>
                  {!readonly && c.state !== "published" && <>
                    <button type="button" className={secondaryButton} disabled={busy} onClick={() => setConfirm({kind:"publish",campaign:c})}>Make public</button>
                    <button type="button" aria-label={`Delete ${c.creative.title}`} title="Delete campaign" disabled={busy} onClick={() => setConfirm({kind:"delete",campaign:c})} className={`${secondaryButton} size-11 p-0`}>
                      <DashboardIcon name="delete" />
                    </button>
                  </>}
                </div>
              </div>
          {!readonly && confirm?.campaign.id === c.id && (
            <section
              role="dialog"
              aria-modal="false"
              aria-labelledby="campaign-confirm-title"
              className={`${styles.notice} m-4 sm:m-5`}
            >
              <h2 id="campaign-confirm-title" className="font-medium">
                {confirm.kind === "publish"
                  ? `Make “${confirm.campaign.creative.title}” public?`
                  : `Delete “${confirm.campaign.creative.title}”?`}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#66758c]">
                {confirm.kind === "publish"
                  ? current
                    ? `This replaces “${current.creative.title}” across the navbar, feed and detail wordmarks. All creative and the destination change together.`
                    : "This campaign will appear across the navbar, feed and detail wordmarks."
                  : "This removes the campaign from your list. Previous versions and referenced assets remain in history."}
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  className={primaryButton}
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
                  className={secondaryButton}
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
          <span className={`${styles.brandMark} mx-auto mb-4`}><DashboardIcon name="campaigns" className="size-5" /></span>
          <h3 className="text-base font-medium">No saved campaigns yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#66758c]">{readonly ? "Your saved campaigns will appear here." : "Create your first draft to preview your creative across all three placements."}</p>
        </div>}
      </section>
      <p role="status" aria-live="polite" className="text-sm text-[#66758c]">{message}</p>
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
  if (error) return <div className={styles.notice}><p role="alert" className={`text-sm ${styles.muted}`}>{error}</p><button type="button" className={`${secondaryButton} mt-4`} onClick={() => {setError(""); setAttempt(value => value + 1);}}>Try again</button></div>;
  if (!data) return <div role="status" className="space-y-6"><span className="sr-only">Loading campaigns…</span><div aria-hidden="true" className={styles.summaryGrid}>{[0, 1, 2].map(item => <div key={item} className={`${styles.surface} space-y-5`}><div className={`${styles.skeleton} w-1/2`} /><div className={`${styles.skeleton} w-3/4`} /></div>)}</div></div>;
  return <CampaignList initial={data} forceReadonly={readonly} paused={paused} />;
}
