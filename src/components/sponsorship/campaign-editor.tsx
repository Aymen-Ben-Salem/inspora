"use client";
import { campaignType } from "./campaign-typography";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
import { CampaignUpload } from "./campaign-upload";
import { SponsorLoading, SponsorSpinner } from "./sponsor-loading";
import { sponsorButton } from "./button-styles";
import { PurchaseOptions } from "./purchase-options";
import { CheckoutReview } from "./checkout-review";
import { AccountSetupHint, CampaignAccountSetup } from "./campaign-account-setup";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";
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
  "focus-ring min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm";
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
  const router = useRouter();
  const [billingMode, setBillingMode] = useState<SponsorBillingMode>("one_time");
  const [fields, setFields] = useState<PreviewFields>(() => ({ ...empty, ...initial, mediaId: initial?.mediaId ?? "", posterId: initial?.posterId ?? "", videoPreviewId: initial?.videoPreviewId ?? "" })),
    [assets, setAssets] = useState<VerifiedSponsorAsset[]>(initial?.assets ?? []),
    [variants, setVariants] = useState<string[]>(initial?.variantIds ?? []),
    [campaignId, setCampaignId] = useState(paid?.campaign?.id);
  const [replaceWebsiteAssets, setReplaceWebsiteAssets] = useState(false);
  const [revision, setRevision] = useState(paid?.campaign?.revision ?? 0),
    [expiresAt, setExpiresAt] = useState<string>(),
    [ready, setReady] = useState(Boolean(paid)),
    [busy, setBusy] = useState<"save" | "suggest" | "checkout">(),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const [suggestionFeedback, setSuggestionFeedback] = useState<{ message: string; failed: boolean }>();
  const suggestionStatusId = useId();
  const accountSetupId = useId();
  const suggestionSetupHintId = useId();
  const uploadSetupHintId = useId();
  const suggesting = busy === "suggest";
  const suggestingTitle = suggesting && !fields.title;
  const loaded = useRef<string | undefined>(undefined);
  const pending = useRef(new Set<AbortController>());
  const actionInFlight = useRef(false);
  const checkoutRetry = useRef<{ signature: string; campaign: OwnedCampaign } | null>(null);
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
    setSuggestionFeedback(undefined);
  }
  async function run(
    action: "save" | "suggest" | "checkout",
    work: (signal: AbortSignal) => Promise<void>,
  ) {
    if (actionInFlight.current || activeUploads.current.size) return;
    actionInFlight.current = true;
    const controller = new AbortController();
    pending.current.add(controller);
    setBusy(action);
    setMessage("");
    setFailed(false);
    setSuggestionFeedback(undefined);
    try {
      await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Try again.";
      if (action === "suggest") setSuggestionFeedback({ message, failed: true });
      else {
        setFailed(true);
        setMessage(message);
      }
    } finally {
      actionInFlight.current = false;
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
  if (!isLoaded || (isSignedIn && !paid && !ready && !failed)) return <SponsorLoading label="Loading campaign…" />;
  return (
    <main className={`${campaignType.body} mx-auto max-w-[1120px] px-4 pb-20 pt-6 text-[#262626] sm:px-8 sm:pt-10`}>
      <div className="mb-10 border-b border-[#e6e6e6] pb-8">
        <div className="flex items-center justify-between gap-4">
          <Link href={(paid || (ready && isSignedIn) ? "/sponsor/dashboard" : "/sponsor") as Route} prefetch={true} className={`${campaignType.body} focus-ring inline-flex min-h-11 items-center text-[#767676]`}>
            {paid || (ready && isSignedIn) ? "← Back to dashboard" : "← Sponsorship"}
          </Link>
        </div>
        <h1 className={`${campaignType.title} mt-4`}>
          {paid ? paid.readonly ? "Campaign history" : paid.campaign ? "Edit campaign" : "Create campaign" : "Prepare your campaign"}
        </h1>
        <p className={`${campaignType.body} mt-3 max-w-xl text-[#767676]`}>
          {paid ? paid.readonly ? "View your past campaign." : "Saved changes go live immediately." : "Add your details and creative, then check out."}
        </p>
      </div>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || paid?.readonly || activeUploads.current.size) return;
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const checkout = !paid && submitter instanceof HTMLButtonElement && submitter.value === "checkout";
            void run(checkout ? "checkout" : "save", async (signal) => {
              const signature = JSON.stringify({ fields, variants, billingMode });
              // Checkout may reserve the saved preparation before its response
              // reaches us. Retry that checkout without trying to edit it again.
              const retry = checkout && checkoutRetry.current?.signature === signature
                ? checkoutRetry.current.campaign : null;
              const c = retry ?? await sponsorRequest<OwnedCampaign>(
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
              router.refresh();
              if (checkout) {
                checkoutRetry.current = { signature, campaign: c };
                const result = await sponsorRequest<{ url: string }>(
                  "checkout", "POST", { checkoutId: c.checkoutId, billingMode }, signal,
                );
                window.location.assign(result.url);
                return;
              }
              checkoutRetry.current = null;
              setMessage(
                paid ? c.state === "published" ? "Public changes saved. All three placements use this version." : "Draft saved. Open Campaigns to make it public." : "Preparation saved. Continue to checkout when you're ready.",
              );
            });
          }}
        >
          {!paid ? <CampaignAccountSetup id={accountSetupId} ready={ready} signedIn={isSignedIn} onContinue={verify} /> : null}
          <h2 className={campaignType.heading}>Campaign details</h2>
          <label className={`${campaignType.label} block`}>
            Public name
            <span className="relative mt-2 block">
              <input className={`${fieldClass} ${suggestingTitle ? "pr-11" : ""}`} required maxLength={160} aria-busy={suggestingTitle} aria-describedby={suggestingTitle ? suggestionStatusId : undefined} disabled={paid?.readonly || Boolean(busy)} value={fields.title} onChange={(event) => update("title", event.target.value)} placeholder="Your product" />
              {suggestingTitle ? <SponsorSpinner className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#767676]" /> : null}
            </span>
          </label>
          <label className={`${campaignType.label} block`}>
            Website destination
            <input
              className={`${fieldClass} mt-2`}
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
          <div>
            <button
              type="button"
              aria-busy={suggesting}
              aria-describedby={!ready ? suggestionSetupHintId : suggesting || suggestionFeedback ? suggestionStatusId : undefined}
              disabled={!ready || Boolean(busy) || uploading || !fields.url || paid?.readonly}
              className={sponsorButton.secondary}
              onClick={() =>
                void run("suggest", async (signal) => {
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
                  setSuggestionFeedback({
                    failed: false,
                    message: s.missingAssets?.length
                      ? `Website suggestions imported. Could not import: ${s.missingAssets.join(", ")}. Upload these below.`
                      : "Website suggestions imported. Review below.",
                  });
                })
              }
            >
              Suggest from website (optional)
            </button>
            {!ready ? <AccountSetupHint id={suggestionSetupHintId} setupId={accountSetupId} /> : null}
            {suggesting || suggestionFeedback ? (
              <p id={suggestionStatusId} role={suggestionFeedback?.failed ? "alert" : "status"} aria-live="polite" className={`${campaignType.body} mt-3 ${suggestionFeedback?.failed ? "text-[#b42318]" : "text-[#767676]"}`}>
                {suggesting ? "Finding suggestions…" : suggestionFeedback?.message}
              </p>
            ) : null}
          </div>
          {fields.iconId || fields.wordmarkId || fields.mediaId ? (
            <label className={`${campaignType.body} flex items-center gap-2 text-[#767676]`}>
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
          <p className={`${campaignType.caption} text-[#767676]`}>
            Imports your website’s name and images. You can replace them below.
          </p>
          <fieldset
            disabled={!ready || Boolean(busy) || paid?.readonly}
            aria-describedby={!ready ? uploadSetupHintId : undefined}
            className="grid gap-4 border-t border-[#e6e6e6] pt-8 disabled:opacity-50 sm:grid-cols-2"
          >
            <legend className="sr-only">Creative assets</legend>
            <h2 className={`${campaignType.heading} sm:col-span-2`}>Creative assets</h2>
            {(
              [
                ["media", "Feed image or video (optional)"],
                ["icon", "Compact icon"],
                ["wordmark", "Full wordmark"],
                ["poster", "Replace video poster (optional)"],
              ] as const
            ).map(([kind, label]) => (
              <div key={kind} className={kind === "media" || kind === "poster" ? "sm:col-span-2" : ""}>
                <CampaignUpload
                  label={label}
                  disabled={!ready || Boolean(busy) || paid?.readonly}
                  busy={uploads[kind]?.busy}
                  suggesting={suggesting && kind !== "poster" && (replaceWebsiteAssets || !fields[uploadRoles[kind].field])}
                  message={uploads[kind]?.message}
                  failed={uploads[kind]?.failed}
                  asset={assets.find((asset) => asset.id === fields[uploadRoles[kind].field])}
                  large={kind === "media"}
                  hint={kind === "media" ? "PNG, JPG, WebP, AVIF, GIF · 10 MiB. MP4, WebM · 50 MiB." : "PNG, JPG, WebP, AVIF · Static · 10 MiB max."}
                  accept={
                    kind === "media"
                      ? "image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm"
                      : "image/png,image/jpeg,image/webp,image/avif"
                  }
                  onUpload={(file) => { void upload(file, kind); }}
                />
              </div>
            ))}
            {fields.mediaId ? (
              <button
                className={`${campaignType.body} focus-ring min-h-11 cursor-pointer underline disabled:cursor-not-allowed`}
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
          {!ready ? <AccountSetupHint id={uploadSetupHintId} setupId={accountSetupId} /> : null}
          {ready && !paid?.readonly ? (
            <button
              disabled={!ready || Boolean(busy) || uploading}
              type="submit"
              className={paid ? sponsorButton.primary : sponsorButton.secondary}
            >
              {paid ? "Save changes" : "Save for later"}
            </button>
          ) : null}
          {expiresAt ? (
            <p className={`${campaignType.caption} text-[#767676]`}>
              Draft expires {new Date(expiresAt).toLocaleString()}.
            </p>
          ) : null}
          {!paid ? <div className="border-t border-[#e6e6e6] pt-8"><PurchaseOptions value={billingMode} onChange={setBillingMode} disabled={Boolean(busy)} /></div> : null}
          {!paid ? <CheckoutReview billingMode={billingMode} disabled={!ready || Boolean(busy) || uploading} busy={busy === "checkout"} /> : null}
          <p
            role={failed ? "alert" : "status"}
            aria-live="polite"
            className={`${campaignType.body} min-h-6 ${failed ? "text-[#b42318]" : "text-[#767676]"}`}
          >
            {busy === "checkout" ? "Saving your campaign and opening checkout…" : busy === "save" ? paid ? "Saving changes…" : "Saving preparation…" : message}
          </p>
          {!paid && failed && checkoutRetry.current ? (
            <Link href={`/sponsor/dashboard?billing=${billingMode}` as Route} className={`${campaignType.body} focus-ring inline-flex min-h-11 cursor-pointer items-center underline`}>
              Manage pending checkout
            </Link>
          ) : null}
          {paid ? <Link href={"/sponsor/campaigns" as Route} prefetch={true} className={`${campaignType.body} focus-ring inline-flex min-h-11 items-center px-3 underline`}>{paid.readonly ? "Back to Campaigns" : "Cancel"}</Link> : null}
        </form>
        <CampaignPreview fields={fields} assets={assets} paid={Boolean(paid)} />
      </div>
    </main>
  );
}
