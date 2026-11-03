"use client";
import { campaignType } from "./campaign-typography";
import type { SponsorCurrency } from "@/features/sponsorship/pricing";
import { useAuth, useUser } from "@clerk/nextjs";
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
  SponsorContact,
} from "@/features/sponsorship/types";
import { CampaignPreview, type PreviewFields } from "./campaign-preview";
import { sponsorRequest, sponsorUploadOperations } from "./upload-operations";
import { CampaignUpload } from "./campaign-upload";
import { SponsorLoading, SponsorSpinner } from "./sponsor-loading";
import { sponsorButton } from "./button-styles";
import { PurchaseOptions } from "./purchase-options";
import { CheckoutReview } from "./checkout-review";
import { clearLocalDraft, localPreviewAsset, pendingDraftEmail, readLocalDraft, saveLocalDraft, type LocalFiles } from "./local-campaign-draft";
import { sponsorContactSchema } from "@/features/sponsorship/validation";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";
const empty: PreviewFields = {
  title: "",
  url: "",
  feedDescription: "",
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
  initialCurrency = "usd",
}: {
  authenticationEnabled?: boolean;
  paid?: PaidEditorMode;
  initialCurrency?: SponsorCurrency;
}) {
  return authenticationEnabled ? (
    <AuthenticatedCampaignEditor paid={paid} initialCurrency={initialCurrency} />
  ) : (
    <CampaignEditorContent isSignedIn={false} isLoaded paid={paid} initialCurrency={initialCurrency} />
  );
}
function AuthenticatedCampaignEditor({ paid, initialCurrency }: { paid?: PaidEditorMode; initialCurrency: SponsorCurrency }) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { user } = useUser();
  return (
    <CampaignEditorContent
      key={isSignedIn && userId ? userId : "anonymous"}
      isSignedIn={Boolean(isSignedIn && userId)}
      isLoaded={isLoaded}
      ownerUserId={isSignedIn ? (userId ?? undefined) : undefined}
      accountEmail={user?.primaryEmailAddress?.emailAddress ?? ""}
      paid={paid}
      initialCurrency={initialCurrency}
    />
  );
}
function CampaignEditorContent({
  isSignedIn,
  isLoaded,
  ownerUserId,
  accountEmail = "",
  paid,
  initialCurrency,
}: {
  isSignedIn: boolean;
  isLoaded: boolean;
  ownerUserId?: string;
  accountEmail?: string;
  paid?: PaidEditorMode;
  initialCurrency: SponsorCurrency;
}) {
  const initial = paid?.campaign?.creative;
  const [contact, setContact] = useState<SponsorContact>({ company: "", contactName: "", email: accountEmail });
  const localFiles = useRef<LocalFiles>({});
  const localUrls = useRef(new Set<string>());
  const form = useRef<HTMLFormElement>(null);
  const [resumeCheckout, setResumeCheckout] = useState(false);
  const router = useRouter();
  const [billingMode, setBillingMode] = useState<SponsorBillingMode>("one_time");
  const currency = initialCurrency;
  const [fields, setFields] = useState<PreviewFields>(() => ({ ...empty, ...initial, feedDescription: initial?.feedDescription ?? "", mediaId: initial?.mediaId ?? "", posterId: initial?.posterId ?? "", videoPreviewId: initial?.videoPreviewId ?? "" })),
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
    const urls = localUrls.current;
    return () => {
      for (const controller of controllers) controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!isLoaded || isSignedIn || paid) return;
    let active = true;
    void readLocalDraft(null, pendingDraftEmail()).then(draft => {
      if (!active || !draft) return;
      localFiles.current = draft.files;
      setFields(draft.fields);
      setContact(draft.contact);
      setBillingMode(draft.billingMode);
      setAssets(Object.entries(draft.files).map(([role, file]) => {
        const asset = localPreviewAsset(file, role as UploadRole);
        localUrls.current.add(asset.url);
        return asset;
      }));
    }).catch(() => { /* Never show an identified owner's draft after sign-out. */ });
    return () => { active = false; };
  }, [isLoaded, isSignedIn, paid]);
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
      .then(async (p) => {
        if (!active) return;
        setReady(true);
        setContact({ company: "", contactName: "", ...p.contact, email: accountEmail });
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
              feedDescription:
                typeof typed.feedDescription === "string" ? typed.feedDescription.slice(0, 300) : "",
            });
        } catch {}
        if (p.campaign && loaded.current !== p.id) {
          loaded.current = p.id;
          const c = p.campaign.creative;
          setFields({
            ...empty,
            ...c,
            feedDescription: c.feedDescription ?? "",
            mediaId: c.mediaId ?? "",
            posterId: c.posterId ?? "",
            videoPreviewId: c.videoPreviewId ?? "",
          });
          setAssets(c.assets);
          setVariants(c.variantIds);
          setRevision(p.revision);
        }
        const draft = await readLocalDraft(ownerUserId!, accountEmail);
        if (!active || !draft) return;
        if (p.campaign) {
          setMessage("You already have a saved preparation. Review it before continuing; your new draft remains in this browser tab.");
          return;
        }
        localFiles.current = draft.files;
        const localAssets = Object.entries(draft.files).map(([role, file]) => {
          const asset = localPreviewAsset(file, role as UploadRole);
          localUrls.current.add(asset.url);
          return asset;
        });
        setFields(draft.fields);
        setAssets(localAssets);
        setContact(draft.contact);
        setBillingMode(draft.billingMode);
        setResumeCheckout(true);
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
  }, [isSignedIn, isLoaded, ownerUserId, paid, accountEmail]);
  useEffect(() => {
    if (!resumeCheckout || !ready || busy) return;
    setResumeCheckout(false);
    const button = form.current?.querySelector<HTMLButtonElement>('button[value="checkout"]');
    if (button) form.current?.requestSubmit(button);
  }, [resumeCheckout, ready, busy]);
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
  async function verify() {
    const parsed = sponsorContactSchema.safeParse(contact);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (!fields.iconId || !fields.wordmarkId)
      throw new Error("Choose a compact icon and full wordmark before checkout.");
    await saveLocalDraft({ ownerUserId: ownerUserId ?? null, fields, contact: parsed.data, billingMode, files: localFiles.current });
    window.location.assign("/api/sponsorship/intent");
  }
  async function flushLocalFiles(signal: AbortSignal) {
    const currentFields = { ...fields };
    let currentVariants = variants;
    for (const kind of ["media", "icon", "wordmark", "poster"] as const) {
      const file = localFiles.current[kind];
      if (!file) continue;
      const result = await prepareAndUploadMedia(file, uploadRoles[kind].kind,
        sponsorUploadOperations(kind, signal), status => { if (!signal.aborted) setMessage(status + "…"); },
        controller => { if (signal.aborted) controller.abort(); else signal.addEventListener("abort", () => controller.abort(), { once: true }); });
      signal.throwIfAborted();
      currentFields[uploadRoles[kind].field] = result.primary.id;
      if (kind === "media") {
        currentFields.posterId = result.poster?.id ?? "";
        currentFields.videoPreviewId = result.videoPreview?.id ?? "";
        currentVariants = result.variants.map(a => a.id);
      }
      delete localFiles.current[kind];
      setAssets(previous => [...previous.filter(a => a.id !== "local-" + kind), result.original, result.primary, ...result.variants,
        ...(result.poster ? [result.poster] : []), ...(result.videoPreview ? [result.videoPreview] : [])]);
      // Preserve completed uploads if a later file needs a retry.
      setFields({ ...currentFields });
      setVariants(currentVariants);
    }
    return { fields: currentFields, variants: currentVariants };
  }
  async function upload(file: File, kind: UploadRole) {
    if (busy || paid?.readonly || activeUploads.current.has(kind)) return;
    if (!ready) {
      try {
        const asset = localPreviewAsset(file, kind);
        localUrls.current.add(asset.url);
        localFiles.current[kind] = file;
        setAssets(previous => [...previous.filter(a => a.id !== asset.id), asset]);
        setFields(previous => ({ ...previous, [uploadRoles[kind].field]: asset.id,
          ...(kind === "media" ? { posterId: "", videoPreviewId: "" } : {}) }));
        if (kind === "media") { delete localFiles.current.poster; setVariants([]); }
        setUploads(previous => ({ ...previous, [kind]: { busy: false, failed: false, message: "" } }));
      } catch (error) {
        setUploads(previous => ({ ...previous, [kind]: { busy: false, failed: true, message: error instanceof Error ? error.message : "Choose another file." } }));
      }
      return;
    }
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
          ref={form}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (paid?.readonly || activeUploads.current.size) return;
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const checkout = !paid && submitter instanceof HTMLButtonElement && submitter.value === "checkout";
            void run(checkout ? "checkout" : "save", async (signal) => {
              if (!ready) { if (checkout) await verify(); return; }
              const parsedContact = paid ? null : sponsorContactSchema.safeParse(contact);
              if (parsedContact && !parsedContact.success) throw new Error(parsedContact.error.issues[0].message);
              const { fields: currentFields, variants: currentVariants } = await flushLocalFiles(signal);
              const signature = JSON.stringify({ fields: currentFields, variants: currentVariants, contact, billingMode, currency });
              // Checkout may reserve the saved preparation before its response
              // reaches us. Retry that checkout without trying to edit it again.
              const retry = checkout && checkoutRetry.current?.signature === signature
                ? checkoutRetry.current.campaign : null;
              const c = retry ?? await sponsorRequest<OwnedCampaign>(
                paid ? campaignId ? `campaigns/${campaignId}` : "campaigns" : "preparation",
                paid && !campaignId ? "POST" : "PUT",
                {
                  title: currentFields.title,
                  url: currentFields.url,
                  feedDescription: currentFields.feedDescription,
                  iconId: currentFields.iconId,
                  wordmarkId: currentFields.wordmarkId,
                  mediaId: currentFields.mediaId || undefined,
                  posterId: currentFields.posterId || undefined,
                  videoPreviewId: currentFields.videoPreviewId || undefined,
                  variantIds: currentVariants,
                  ...(parsedContact?.success ? { contact: parsedContact.data } : {}),
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
                  "checkout", "POST", { checkoutId: c.checkoutId, billingMode, currency }, signal,
                );
                try { await clearLocalDraft(); } catch {}
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
          <label className={`${campaignType.label} block`}>
            Short feed description
            <textarea
              name="feedDescription"
              className={`${fieldClass} mt-2 resize-y`}
              rows={2}
              required
              maxLength={300}
              disabled={paid?.readonly || Boolean(busy)}
              value={fields.feedDescription}
              onChange={(event) => update("feedDescription", event.target.value)}
              placeholder="A short sentence about your product"
            />

          </label>
          {ready ? <div>
            <button
              type="button"
              aria-busy={suggesting}
              aria-describedby={suggesting || suggestionFeedback ? suggestionStatusId : undefined}
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
            {suggesting || suggestionFeedback ? (
              <p id={suggestionStatusId} role={suggestionFeedback?.failed ? "alert" : "status"} aria-live="polite" className={`${campaignType.body} mt-3 ${suggestionFeedback?.failed ? "text-[#b42318]" : "text-[#767676]"}`}>
                {suggesting ? "Finding suggestions…" : suggestionFeedback?.message}
              </p>
            ) : null}
          </div> : null}
          {ready && (fields.iconId || fields.wordmarkId || fields.mediaId) ? (
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
          {ready ? <p className={`${campaignType.caption} text-[#767676]`}>
            Imports your website’s name, description and images. You can edit them below.
          </p> : null}
          <fieldset
            disabled={Boolean(busy) || paid?.readonly}
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
                  disabled={Boolean(busy) || paid?.readonly}
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
                  delete localFiles.current.media;
                  delete localFiles.current.poster;
                }}
              >
                Use brand card instead
              </button>
            ) : null}
          </fieldset>
          {!paid ? <section className="space-y-5 border-t border-[#e6e6e6] pt-8" aria-labelledby="sponsor-contact-title">
            <h2 id="sponsor-contact-title" className={campaignType.heading}>Contact details</h2>
            {([["company", "Company", 160], ["contactName", "Contact name", 160], ["email", "Email", 320]] as const).map(([key, label, limit]) =>
              <label key={key} className={`${campaignType.label} block`}>
                {label}
                <span className="relative mt-2 block">
                  <input name={key} type={key === "email" ? "email" : "text"} required maxLength={limit}
                    autoComplete={key === "company" ? "organization" : key === "contactName" ? "name" : "email"}
                    className={`${fieldClass} pr-16`} disabled={Boolean(busy)}
                    readOnly={key === "email" && Boolean(isSignedIn && accountEmail)}
                    value={contact[key]} onChange={event => setContact(previous => ({ ...previous, [key]: event.target.value }))} />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#767676]">{contact[key].length}/{limit}</span>
                </span>
              </label>)}
            <p className={`${campaignType.caption} text-[#767676]`}>We’ll use this email for campaign access and receipts.</p>
          </section> : null}
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
          {!paid ? <div className="border-t border-[#e6e6e6] pt-8"><PurchaseOptions value={billingMode} onChange={setBillingMode} disabled={Boolean(busy)} currency={currency} /></div> : null}
          {!paid ? <CheckoutReview billingMode={billingMode} currency={currency} disabled={Boolean(busy) || uploading} busy={busy === "checkout"} /> : null}
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
