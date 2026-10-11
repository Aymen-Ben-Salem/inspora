"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { prepareAndUploadMedia } from "@/features/media/prepare-and-upload";
import { fillEmptySponsorFields } from "@/features/sponsorship/suggestion-fields";
import type {
  OwnedCampaign,
  SponsorPreparation,
  VerifiedSponsorAsset,
  MetadataSuggestions,
} from "@/features/sponsorship/types";
import { CampaignPreview, type PreviewFields } from "./campaign-preview";
import { sponsorRequest, sponsorUploadOperations } from "./upload-operations";
const empty: PreviewFields = {
  title: "",
  url: "",
  iconId: "",
  wordmarkId: "",
  mediaId: "",
  posterId: "",
  videoPreviewId: "",
};
const fieldClass =
  "focus-ring mt-2 min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm";
const uploadRoles = {
  media: { kind: "sponsor-media", field: "mediaId" },
  icon: { kind: "sponsor-icon", field: "iconId" },
  wordmark: { kind: "sponsor-wordmark", field: "wordmarkId" },
  poster: { kind: "website-poster", field: "posterId" },
} as const;
type UploadRole = keyof typeof uploadRoles;
type UploadState = { busy: boolean; message: string; failed: boolean };
export type PaidEditorMode = { campaign?: OwnedCampaign; readonly: boolean };
export function CampaignEditor({
  authenticationEnabled = true,
  paid,
}: {
  authenticationEnabled?: boolean;
  paid?: PaidEditorMode;
}) {
  return authenticationEnabled ? (
    <AuthenticatedCampaignEditor paid={paid} />
  ) : (
    <CampaignEditorContent isSignedIn={false} isLoaded paid={paid} />
  );
}
function AuthenticatedCampaignEditor({ paid }: { paid?: PaidEditorMode }) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  return (
    <CampaignEditorContent
      key={isSignedIn && userId ? userId : "anonymous"}
      isSignedIn={Boolean(isSignedIn && userId)}
      isLoaded={isLoaded}
      ownerUserId={isSignedIn ? (userId ?? undefined) : undefined}
      paid={paid}
    />
  );
}
function CampaignEditorContent({
  isSignedIn,
  isLoaded,
  ownerUserId,
  paid,
}: {
  isSignedIn: boolean;
  isLoaded: boolean;
  ownerUserId?: string;
  paid?: PaidEditorMode;
}) {
  const initial = paid?.campaign?.creative;
  const [fields, setFields] = useState<PreviewFields>(() => ({ ...empty, ...initial, mediaId: initial?.mediaId ?? "", posterId: initial?.posterId ?? "", videoPreviewId: initial?.videoPreviewId ?? "" })),
    [assets, setAssets] = useState<VerifiedSponsorAsset[]>(initial?.assets ?? []),
    [variants, setVariants] = useState<string[]>(initial?.variantIds ?? []),
    [campaignId, setCampaignId] = useState(paid?.campaign?.id);
  const [replaceWebsiteAssets, setReplaceWebsiteAssets] = useState(false);
  const [revision, setRevision] = useState(paid?.campaign?.revision ?? 0),
    [expiresAt, setExpiresAt] = useState<string>(),
    [ready, setReady] = useState(Boolean(paid)),
    [busy, setBusy] = useState<string>(),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const loaded = useRef<string | undefined>(undefined);
  const pending = useRef(new Set<AbortController>());
  const activeUploads = useRef(new Set<UploadRole>());
  const manualPosterRevision = useRef(0);
  const [uploads, setUploads] = useState<
    Partial<Record<UploadRole, UploadState>>
  >({});
  const uploading = Object.values(uploads).some((upload) => upload.busy);
  useEffect(() => {
    const controllers = pending.current;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || paid) return;
    let active = true;
    const controller = new AbortController();
    void sponsorRequest<SponsorPreparation>(
      "preparation",
      "POST",
      undefined,
      controller.signal,
    )
      .then((p) => {
        if (!active) return;
        setReady(true);
        setExpiresAt(new Date(p.expiresAt).toISOString());
        // Restore manual fields after verification only when no saved creative exists.
        try {
          const stored = sessionStorage.getItem("inspora:sponsor-typed");
          sessionStorage.removeItem("inspora:sponsor-typed");
          const typed = stored ? JSON.parse(stored) : null;
          if (
            !p.campaign &&
            typed &&
            (typed.ownerUserId === null || typed.ownerUserId === ownerUserId)
          )
            setFields({
              ...empty,
              title:
                typeof typed.title === "string"
                  ? typed.title.slice(0, 160)
                  : "",
              url:
                typeof typed.url === "string" ? typed.url.slice(0, 2048) : "",
            });
        } catch {}
        if (p.campaign && loaded.current !== p.id) {
          loaded.current = p.id;
          const c = p.campaign.creative;
          setFields({
            ...empty,
            ...c,
            mediaId: c.mediaId ?? "",
            posterId: c.posterId ?? "",
            videoPreviewId: c.videoPreviewId ?? "",
          });
          setAssets(c.assets);
          setVariants(c.variantIds);
          setRevision(p.revision);
        }
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) {
          setFailed(true);
          setMessage(error.message);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isSignedIn, isLoaded, ownerUserId, paid]);
  function update(key: keyof PreviewFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setMessage("");
  }
  async function run(
    label: string,
    work: (signal: AbortSignal) => Promise<void>,
  ) {
    if (busy || activeUploads.current.size) return;
    const controller = new AbortController();
    pending.current.add(controller);
    setBusy(label);
    setMessage("");
    setFailed(false);
    try {
      await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      pending.current.delete(controller);
      if (!controller.signal.aborted) setBusy(undefined);
    }
  }
  function verify() {
    try {
      sessionStorage.setItem(
        "inspora:sponsor-typed",
        JSON.stringify({
          ownerUserId: ownerUserId ?? null,
          title: fields.title,
          url: fields.url,
        }),
      );
    } catch {}
    window.location.assign("/api/sponsorship/intent");
  }
  async function upload(file: File, kind: UploadRole) {
    if (busy || paid?.readonly || activeUploads.current.has(kind)) return;
    const controller = new AbortController(),
      signal = controller.signal;
    const posterRevision = manualPosterRevision.current;
    activeUploads.current.add(kind);
    pending.current.add(controller);
    setMessage("");
    setFailed(false);
    setUploads((previous) => ({
      ...previous,
      [kind]: { busy: true, failed: false, message: `Uploading ${kind}…` },
    }));
    try {
      const result = await prepareAndUploadMedia(
        file,
        uploadRoles[kind].kind,
        sponsorUploadOperations(kind, signal),
        (status) => {
          if (!signal.aborted)
            setUploads((previous) => ({
              ...previous,
              [kind]: { busy: true, failed: false, message: `${status}…` },
            }));
        },
        (controller) => {
          if (signal.aborted) controller.abort();
          else
            signal.addEventListener("abort", () => controller.abort(), {
              once: true,
            });
        },
      );
      signal.throwIfAborted();
      if (kind === "poster") manualPosterRevision.current++;
      setAssets((previous) => [
        ...previous,
        result.original,
        result.primary,
        ...result.variants,
        ...(result.poster ? [result.poster] : []),
        ...(result.videoPreview ? [result.videoPreview] : []),
      ]);
      setFields((f) => ({
        ...f,
        [uploadRoles[kind].field]: result.primary.id,
        ...(kind === "media"
          ? {
              // A manual poster that finishes during this upload wins over
              // the generated poster, regardless of completion order.
              posterId:
                manualPosterRevision.current === posterRevision
                  ? result.poster?.id ?? ""
                  : f.posterId,
              videoPreviewId: result.videoPreview?.id ?? "",
            }
          : {}),
      }));
      if (kind === "media") setVariants(result.variants.map((a) => a.id));
      setUploads((previous) => ({
        ...previous,
        [kind]: { busy: false, failed: false, message: "Verified privately." },
      }));
    } catch (error) {
      if (!signal.aborted)
        setUploads((previous) => ({
          ...previous,
          [kind]: {
            busy: false,
            failed: true,
            message: error instanceof Error ? error.message : "Try again.",
          },
        }));
    } finally {
      activeUploads.current.delete(kind);
      pending.current.delete(controller);
    }
  }
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 text-[#262626] sm:px-8">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <a href="/sponsor" className="focus-ring text-sm text-[#767676]">
            ← Sponsorship
          </a>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          {paid ? paid.readonly ? "Campaign history" : paid.campaign ? "Edit campaign" : "Create campaign" : "Prepare your campaign"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#767676]">
          {paid ? paid.readonly ? "Your past creative remains available to view. Campaign history is read-only." : "Review all three placements. Save changes applies a complete public edit immediately; Cancel leaves the saved campaign intact." : "Start with your website, then review your icon, feed creative and full wordmark. A saved preparation lasts 24 hours and uses no paid seat."}
        </p>
      </div>
      {!ready ? (
        <div className="mb-8 space-y-3 rounded-md border border-[#e6e6e6] bg-[#fafafa] p-4">
          <p className="text-sm leading-6 text-[#767676]">
            Verify your email to use website suggestions, upload assets and save
            your private preparation. You can enter details before verifying.
          </p>
          <button
            type="button"
            onClick={verify}
            className="focus-ring min-h-11 rounded-md bg-[#262626] px-5 text-sm text-white"
          >
            Verify sponsor access to save
          </button>
        </div>
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (paid?.readonly || activeUploads.current.size) return;
            void run(paid ? "Saving changes…" : "Saving preparation…", async (signal) => {
              const c = await sponsorRequest<OwnedCampaign>(
                paid ? campaignId ? `campaigns/${campaignId}` : "campaigns" : "preparation",
                paid && !campaignId ? "POST" : "PUT",
                {
                  title: fields.title,
                  url: fields.url,
                  iconId: fields.iconId,
                  wordmarkId: fields.wordmarkId,
                  mediaId: fields.mediaId || undefined,
                  posterId: fields.posterId || undefined,
                  videoPreviewId: fields.videoPreviewId || undefined,
                  variantIds: variants,
                  expectedRevision: revision,
                },
                signal,
              );
              setRevision(c.revision);
              if (paid) {
                setCampaignId(c.id);
                window.dispatchEvent(new Event("sponsorship-changed"));
              }
              setMessage(
                paid ? c.state === "published" ? "Public changes saved. All three placements use this version." : "Draft saved. Open Campaigns to make it public." : "Preparation saved. Open your sponsorship dashboard to continue to checkout.",
              );
            });
          }}
        >
          <label className="block text-sm font-medium">
            Website destination
            <input
              className={fieldClass}
              type="url"
              disabled={paid?.readonly || Boolean(busy)}
              required
              maxLength={2048}
              value={fields.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="https://your-product.com"
              autoComplete="url"
            />
          </label>
          <button
            type="button"
            disabled={!ready || Boolean(busy) || uploading || !fields.url || paid?.readonly}
            className="focus-ring min-h-11 rounded-md border border-[#e6e6e6] px-4 text-sm disabled:opacity-40"
            onClick={() =>
              void run("Finding suggestions…", async (signal) => {
                const s = await sponsorRequest<
                  MetadataSuggestions & { assets: VerifiedSponsorAsset[] }
                >("metadata", "POST", { url: fields.url }, signal);
                setFields((f) => {
                  const filled = fillEmptySponsorFields(
                    f,
                    s,
                    replaceWebsiteAssets,
                  );
                  return filled.mediaId !== f.mediaId
                    ? { ...filled, posterId: "", videoPreviewId: "" }
                    : filled;
                });
                if (s.mediaId && (replaceWebsiteAssets || !fields.mediaId))
                  setVariants([]);
                setAssets((a) => [...a, ...s.assets]);
                setMessage(
                  s.missingAssets?.length
                    ? `Website suggestions imported. Could not import: ${s.missingAssets.join(", ")}. Upload these below.`
                    : "Website suggestions imported. Review your three placement previews.",
                );
              })
            }
          >
            Suggest from website (optional)
          </button>
          {fields.iconId || fields.wordmarkId || fields.mediaId ? (
            <label className="flex items-center gap-2 text-sm text-[#767676]">
              <input
                type="checkbox"
                checked={replaceWebsiteAssets}
                disabled={!ready || Boolean(busy) || uploading}
                onChange={(event) =>
                  setReplaceWebsiteAssets(event.target.checked)
                }
              />
              Replace current assets with website suggestions
            </label>
          ) : null}
          <p className="text-xs leading-5 text-[#767676]">
            Uses the website icon, its brand wordmark when available and its OG
            image for the feed. Review the previews or upload replacements
            below.
          </p>
          <label className="block text-sm font-medium">
            Public name
            <input
              className={fieldClass}
              required
              maxLength={160}
              disabled={paid?.readonly || Boolean(busy)}
              value={fields.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Your product"
            />
          </label>
          <fieldset
            disabled={!ready || Boolean(busy) || paid?.readonly}
            className="space-y-5 disabled:opacity-50"
          >
            <legend className="mb-3 text-sm font-medium">Owned media</legend>
            <p className="text-xs leading-5 text-[#767676]">
              Images: PNG, JPEG, WebP, AVIF or GIF, up to 10 MiB. Brand assets
              and posters must be static. Videos: MP4 or WebM up to 50 MiB; 20
              MiB recommended. SVG uploads are not supported. A video gets a
              verified preview and poster before saving.
            </p>
            {(
              [
                ["media", "Feed image or video (optional)"],
                ["icon", "Compact icon"],
                ["wordmark", "Full wordmark"],
                ["poster", "Replace video poster (optional)"],
              ] as const
            ).map(([kind, label]) => (
              <label key={kind} className="block text-sm">
                {label}
                <input
                  aria-label={label}
                  type="file"
                  disabled={uploads[kind]?.busy}
                  accept={
                    kind === "media"
                      ? "image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm"
                      : "image/png,image/jpeg,image/webp,image/avif"
                  }
                  className={`${fieldClass} file:mr-3 file:rounded file:border-0 file:bg-[#fafafa] file:px-3 file:py-1`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file, kind);
                    e.target.value = "";
                  }}
                />
                {uploads[kind] ? (
                  <span role={uploads[kind]?.failed ? "alert" : "status"} aria-live="polite" className={`mt-2 block text-xs ${uploads[kind]?.failed ? "text-[#b42318]" : "text-[#767676]"}`}>
                    {uploads[kind]?.message}
                  </span>
                ) : null}
              </label>
            ))}
            {fields.mediaId ? (
              <button
                className="focus-ring min-h-11 text-sm underline"
                type="button"
                disabled={uploads.media?.busy || uploads.poster?.busy}
                onClick={() => {
                  setFields((f) => ({
                    ...f,
                    mediaId: "",
                    posterId: "",
                    videoPreviewId: "",
                  }));
                  setVariants([]);
                }}
              >
                Use brand card instead
              </button>
            ) : null}
          </fieldset>
          {ready && !paid?.readonly ? (
            <button
              disabled={!ready || Boolean(busy) || uploading}
              type="submit"
              className="focus-ring min-h-11 rounded-md bg-[#262626] px-5 text-sm text-white disabled:opacity-40"
            >
              {paid ? "Save changes" : "Save private preparation"}
            </button>
          ) : null}
          {expiresAt ? (
            <p className="text-xs text-[#767676]">
              Expires {new Date(expiresAt).toLocaleString()}. Saving does not
              extend this deadline.
            </p>
          ) : null}
          <p
            role={failed ? "alert" : "status"}
            aria-live="polite"
            className={`min-h-6 text-sm ${failed ? "text-[#b42318]" : "text-[#767676]"}`}
          >
            {busy || message}
          </p>
          {paid ? <Link href={"/sponsor/campaigns" as Route} prefetch={false} className="focus-ring inline-flex min-h-11 items-center px-3 text-sm underline">{paid.readonly ? "Back to Campaigns" : "Cancel"}</Link> : <div className="rounded-md border border-[#e6e6e6] bg-[#fafafa] p-4 text-sm leading-6">
            <a href="/sponsor/dashboard" className="focus-ring font-medium underline">Open sponsorship dashboard</a>
            <p className="text-[#767676]">
              No payment, paid account, public campaign or seat reservation is
              created by this preparation.
            </p>
          </div>}
        </form>
        <CampaignPreview fields={fields} assets={assets} paid={Boolean(paid)} />
      </div>
    </main>
  );
}
