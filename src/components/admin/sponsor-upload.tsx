"use client";

import { useEffect, useRef, useState } from "react";
import { CampaignUpload } from "@/components/sponsorship/campaign-upload";
import type { CampaignDisplayAsset } from "@/components/sponsorship/campaign-display-asset";
import type { MediaUploadKind, UploadedAdminMedia } from "@/features/admin/media-upload";
import { defaultUploadOperations, prepareAndUploadMedia, type UploadStatus } from "@/features/media/prepare-and-upload";

export function AdminSponsorUpload({ label, kind, asset, disabled, onUploaded, onBusyChange }: {
  label: string;
  kind: Extract<MediaUploadKind, "sponsor-media" | "sponsor-icon">;
  asset?: CampaignDisplayAsset;
  disabled: boolean;
  onUploaded: (media: UploadedAdminMedia) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");
  const mounted = useRef(true), controller = useRef<AbortController | null>(null), inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  async function upload(file: File) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setError(""); onBusyChange(true);
    try {
      // Uses only the authenticated admin upload endpoints, never sponsor Checkout.
      const media = await prepareAndUploadMedia(file, kind, defaultUploadOperations,
        (next) => { if (mounted.current) setStatus(next); },
        (next) => { controller.current = next; if (!mounted.current) next.abort(); });
      if (mounted.current) onUploaded(media);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      inFlight.current = false; controller.current = null;
      if (mounted.current) { setStatus("idle"); onBusyChange(false); }
    }
  }

  const media = kind === "sponsor-media";
  return <div className="grid gap-2">
    <CampaignUpload label={label} asset={asset} disabled={disabled} busy={status !== "idle"}
      large={media} failed={Boolean(error)} message={error || (status !== "idle" ? `${status.replaceAll("-", " ")}…` : undefined)}
      accept={`image/avif,image/jpeg,image/png,image/webp${media ? ",image/gif,video/mp4,video/webm" : ""}`}
      hint={media ? "PNG, JPG, WebP, AVIF, GIF · 10 MB\nMP4, WebM · 50 MB" : "PNG, JPG, WebP, AVIF · Static · 10 MB"}
      onUpload={(file) => { void upload(file); }} />
    {status !== "idle" ? <button type="button" onClick={() => controller.current?.abort()}
      className="focus-ring justify-self-start text-xs text-[#777] underline">Cancel upload</button> : null}
  </div>;
}
