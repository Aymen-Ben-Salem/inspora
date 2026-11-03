"use client";
import { campaignType } from "./campaign-typography";
import type { SponsorCurrency } from "@/features/sponsorship/pricing";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { BrandMark } from "../brand-mark";
import { prepareAndUploadMedia, type UploadStatus } from "@/features/media/prepare-and-upload";
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
import type { DraftWebsiteSuggestions } from "@/features/sponsorship/draft-suggestions";
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
const uploadLabels = { media: "feed media", icon: "compact icon", wordmark: "full wordmark", poster: "video poster" } as const;
const uploadStages: Record<UploadStatus, string> = {
  idle: "Preparing", analyzing: "Checking", optimizing: "Optimizing",
  "loading-converter": "Preparing", "analyzing-gif": "Checking", "optimizing-animation": "Optimizing",
  "analyzing-video": "Checking", "cropping-video": "Cropping", "optimizing-video": "Optimizing",
  signing: "Preparing upload for", uploading: "Uploading", verifying: "Verifying",
};
type UploadRole = keyof typeof uploadRoles;
type UploadState = { busy: boolean; message: string; failed: boolean };
export type PaidEditorMode = { campaign?: OwnedCampaign; readonly: boolean };
export function CampaignEditor({
  authenticationEnabled = true,
  paid,
  initialCurrency = "usd",
  checkoutHandoff = false,
}: {
  authenticationEnabled?: boolean;
  paid?: PaidEditorMode;
  initialCurrency?: SponsorCurrency;
  checkoutHandoff?: boolean;
}) {
  return authenticationEnabled ? (
    <AuthenticatedCampaignEditor paid={paid} initialCurrency={initialCurrency} checkoutHandoff={checkoutHandoff} />
  ) : (
    <CampaignEditorContent isSignedIn={false} isLoaded paid={paid} initialCurrency={initialCurrency} checkoutHandoff={checkoutHandoff} />
  );
}
function AuthenticatedCampaignEditor({ paid, initialCurrency, checkoutHandoff }: { paid?: PaidEditorMode; initialCurrency: SponsorCurrency; checkoutHandoff: boolean }) {
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
      checkoutHandoff={checkoutHandoff}
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
  checkoutHandoff,
}: {
  isSignedIn: boolean;
  isLoaded: boolean;
  ownerUserId?: string;
  accountEmail?: string;
  paid?: PaidEditorMode;
  initialCurrency: SponsorCurrency;
  checkoutHandoff: boolean;
}) {
  const initial = paid?.campaign?.creative;
  const [contact, setContact] = useState<SponsorContact>({ company: "", email: accountEmail });
  const localFiles = useRef<LocalFiles>({});
  const localUrls = useRef(new Set<string>());
  const [resumeCheckout, setResumeCheckout] = useState(false);
  const [handoffHasDraft, setHandoffHasDraft] = useState(false);
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
  const [checkoutTakingLonger, setCheckoutTakingLonger] = useState(false);
  useEffect(() => {
    if (busy !== "checkout") return;
    const timer = window.setTimeout(() => setCheckoutTakingLonger(true), 15000);
    return () => window.clearTimeout(timer);
  }, [busy]);

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
        setContact({ company: "", ...p.contact, email: accountEmail });
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
        if (!active) return;
        if (!draft) {
          if (checkoutHandoff) {
            setFailed(true);
            setMessage("Open your campaign to continue. There is no pending campaign in this browser tab.");
          }
          return;
        }
        if (p.campaign) {
          if (checkoutHandoff) setFailed(true);
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
        setHandoffHasDraft(true);
        setResumeCheckout(checkoutHandoff);
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
  }, [isSignedIn, isLoaded, ownerUserId, paid, accountEmail, checkoutHandoff]);
  const resumePayment = useEffectEvent(() => submitCampaign(true));
  useEffect(() => {
    if (!resumeCheckout || !ready || busy) return;
    setResumeCheckout(false);
    resumePayment();
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
    setCheckoutTakingLonger(false);
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
    setMessage("Keeping your campaign ready for email verification…");
    await saveLocalDraft({ ownerUserId: ownerUserId ?? null, fields, contact: parsed.data, billingMode, files: localFiles.current });
    setMessage("Opening email verification…");
    window.location.assign("/api/sponsorship/intent");
  }
  async function flushLocalFiles(signal: AbortSignal) {
    const currentFields = { ...fields };
    let currentVariants = variants;
    const roles = (["media", "icon", "wordmark", "poster"] as const).filter(kind => localFiles.current[kind]);
    for (const [index, kind] of roles.entries()) {
      const file = localFiles.current[kind];
      if (!file) continue;
      const result = await prepareAndUploadMedia(file, uploadRoles[kind].kind,
        sponsorUploadOperations(kind, signal), status => {
          if (!signal.aborted) setMessage(`${uploadStages[status]} ${uploadLabels[kind]} (${index + 1} of ${roles.length})…`);
        },
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
  function submitCampaign(checkout: boolean) {
    if (paid?.readonly || activeUploads.current.size) return;
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
      setMessage("Saving your campaign…");
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
        setMessage("Opening secure checkout…");
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
  }
  if (checkoutHandoff) {
    const signedOut = isLoaded && !isSignedIn;
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12 text-[#262626]">
        <div className="w-full max-w-md rounded-lg border border-[#e6e6e6] bg-white px-6 py-10 text-center sm:px-10">
          <div className="mb-8 flex justify-center"><BrandMark /></div>
          <h1 className="text-xl font-medium">{signedOut ? "Sign in to continue" : failed ? "Checkout needs your attention" : "Preparing your payment…"}</h1>
          <div role={failed ? "alert" : "status"} aria-label="Checkout progress" aria-live="polite" aria-atomic="true" className="mt-5 text-sm leading-6 text-[#767676]">
            {!failed && !signedOut ? <SponsorSpinner className="mx-auto mb-3 size-5" /> : null}
            <p>{signedOut ? "Verify your email to continue to payment." : message || "Restoring your campaign…"}</p>
            {checkoutTakingLonger && !failed && !signedOut ? <p className="mt-3">This is taking longer than usual. Please keep this tab open.</p> : null}
          </div>
          {signedOut ? <Link href={"/api/sponsorship/intent" as Route} className={`${sponsorButton.primary} mt-6`}>Continue with email</Link> : null}
          {failed ? <div className="mt-6 flex flex-col items-center gap-4">
            {handoffHasDraft ? <button type="button" className={sponsorButton.primary} onClick={() => submitCampaign(true)}>Try again</button> : null}
            <Link href={(checkoutRetry.current ? "/sponsor/dashboard" : "/sponsor/start") as Route} className="focus-ring text-sm underline underline-offset-4">{checkoutRetry.current ? "Manage pending checkout" : "Review your campaign"}</Link>
          </div> : null}
        </div>
      </main>
    );
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
      {busy === "checkout" ? (
        <div role="status" aria-label="Checkout progress" aria-live="polite" aria-atomic="true"
          style={{ top: "calc(2 * var(--archive-header-pad-y, 20px) + 56px)" }}
          className="sticky z-10 mb-8 flex items-start gap-3 rounded-md border border-[#e6e6e6] bg-[#fafafa] p-4 shadow-sm">
          <SponsorSpinner className="mt-0.5 size-4 shrink-0 text-[#767676]" />
          <div>
            <p className={campaignType.heading}>{ready ? "Preparing your checkout" : "Continuing with email"}</p>
            <p className={`${campaignType.body} mt-1 text-[#767676]`}>{message || "Preparing your campaign…"}</p>
            {checkoutTakingLonger ? <p className={`${campaignType.caption} mt-2 text-[#767676]`}>This is taking longer than usual. Please keep this tab open.</p> : null}
          </div>
        </div>
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (paid?.readonly || activeUploads.current.size) return;
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const checkout = !paid && submitter instanceof HTMLButtonElement && submitter.value === "checkout";
            submitCampaign(checkout);
          }}
        >
          {!paid ? <section className="space-y-5" aria-labelledby="sponsor-contact-title">
            <h2 id="sponsor-contact-title" className={campaignType.heading}>Contact details</h2>
            {([["company", "Company", 160], ["email", "Email", 320]] as const).map(([key, label, limit]) =>
              <label key={key} className={`${campaignType.label} block`}>
                {label}
                <span className="relative mt-2 block">
                  <input name={key} type={key === "email" ? "email" : "text"} required maxLength={limit}
                    autoComplete={key === "company" ? "organization" : "email"}
                    className={fieldClass} disabled={Boolean(busy)}
                    readOnly={key === "email" && Boolean(isSignedIn && accountEmail)}
                    value={contact[key]} onChange={event => setContact(previous => ({ ...previous, [key]: event.target.value }))} />
                </span>
              </label>)}
          </section> : null}
          <h2 className={`${campaignType.heading} ${!paid ? "border-t border-[#e6e6e6] pt-8" : ""}`}>Campaign details</h2>
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
          <div>
            <button
              type="button"
              aria-busy={suggesting}
              aria-describedby={suggesting || suggestionFeedback ? suggestionStatusId : undefined}
              disabled={Boolean(busy) || uploading || !fields.url || paid?.readonly}
              className={sponsorButton.secondary}
              onClick={() =>
                void run("suggest", async (signal) => {
                  let s: MetadataSuggestions & { assets: VerifiedSponsorAsset[] };
                  if (ready) {
                    s = await sponsorRequest("metadata", "POST", { url: fields.url }, signal);
                    for (const kind of ["icon", "wordmark", "media"] as const) {
                      const field = uploadRoles[kind].field;
                      if (s[field] && (replaceWebsiteAssets || !fields[field])) delete localFiles.current[kind];
                    }
                  } else {
                    const draft = await sponsorRequest<DraftWebsiteSuggestions>("metadata-draft", "POST", { url: fields.url }, signal);
                    s = { title: draft.title, feedDescription: draft.feedDescription, missingAssets: draft.missingAssets, assets: [] };
                    for (const item of draft.files) {
                      const field = uploadRoles[item.kind].field;
                      if (fields[field] && !replaceWebsiteAssets) continue;
                      const bytes = Uint8Array.from(atob(item.base64), character => character.charCodeAt(0));
                      const file = new File([bytes], `website-${item.kind}.${item.contentType.split("/")[1]}`, { type: item.contentType });
                      const asset = localPreviewAsset(file, item.kind);
                      localFiles.current[item.kind] = file;
                      localUrls.current.add(asset.url);
                      s[field] = asset.id;
                      s.assets.push(asset);
                    }
                  }
                  setFields((f) => {
                    const filled = fillEmptySponsorFields(
                      f,
                      s,
                      replaceWebsiteAssets,
                    );
                    return s.mediaId && (replaceWebsiteAssets || !f.mediaId)
                      ? { ...filled, posterId: "", videoPreviewId: "" }
                      : filled;
                  });
                  if (s.mediaId && (replaceWebsiteAssets || !fields.mediaId)) {
                    setVariants([]);
                    delete localFiles.current.poster;
                  }
                  setAssets((a) => [...a.filter(asset => !s.assets.some(next => next.id === asset.id)), ...s.assets]);
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
          </div>
          {(fields.iconId || fields.wordmarkId || fields.mediaId) ? (
            <label className={`${campaignType.body} flex items-center gap-2 text-[#767676]`}>
              <input
                type="checkbox"
                checked={replaceWebsiteAssets}
                disabled={Boolean(busy) || uploading}
                onChange={(event) =>
                  setReplaceWebsiteAssets(event.target.checked)
                }
              />
              Replace current assets with website suggestions
            </label>
          ) : null}
          <p className={`${campaignType.caption} text-[#767676]`}>
            Imports your website’s name, description and images. You can edit them below.
          </p>
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
                  hint={kind === "media" ? "PNG, JPG, WebP, AVIF, GIF · 10 MiB\nMP4, WebM · 50 MiB max." : "PNG, JPG, WebP, AVIF\nStatic images · 10 MiB max."}
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
            {busy === "checkout" ? null : busy === "save" ? message || (paid ? "Saving changes…" : "Saving preparation…") : message}
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
