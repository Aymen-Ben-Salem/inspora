"use client";

import { useEffect, useRef, useState } from "react";
import { MediaCropDialog } from "./video-crop-dialog";
import { cropImageFile } from "@/features/admin/image-crop";
import type { VideoCropSelection } from "@/features/admin/video-crop";
import { MAX_IMAGE_UPLOAD_BYTES, type UploadedAdminMedia } from "@/features/admin/media-upload";
import { prepareAndUploadMedia } from "@/features/media/prepare-and-upload";

export function WebsiteFaviconCrop({ url, onUploaded, onBusyChange }: {
  url: string;
  onUploaded: (media: UploadedAdminMedia) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controllerRef.current?.abort(); onBusyChange(false); };
  }, [onBusyChange]);

  async function apply(selection: VideoCropSelection) {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); onBusyChange(true); setError(""); setStatus("Opening favicon…");
    const timeout = setTimeout(() => controller.abort(), 30000);
    let stopPreparation: (() => void) | undefined;
    try {
      const response = await fetch(url, { signal: controller.signal, mode: "cors" });
      if (!response.ok) throw new Error("The favicon could not be downloaded. Upload the image again and retry cropping.");
      if (Number(response.headers.get("content-length")) > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Favicons must be 10 MB or smaller.");
      const blob = await response.blob();
      clearTimeout(timeout);
      controller.signal.throwIfAborted();
      if (blob.size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Favicons must be 10 MB or smaller.");
      setStatus("Cropping favicon…");
      const file = await cropImageFile(blob, selection, controller.signal);
      const result = await prepareAndUploadMedia(file, "website-favicon", undefined, (stage) => {
        if (mounted.current && !controller.signal.aborted) setStatus(stage === "uploading" ? "Uploading cropped favicon…" : stage === "verifying" ? "Checking upload…" : "Preparing cropped favicon…");
      }, (preparation) => {
        stopPreparation = () => preparation.abort();
        controller.signal.addEventListener("abort", stopPreparation, { once: true });
        if (controller.signal.aborted) preparation.abort();
      });
      if (mounted.current && !controller.signal.aborted) { setOpen(false); onUploaded(result); }
    } catch (cause) {
      if (mounted.current && controllerRef.current === controller) setError(controller.signal.aborted ? "Cropping was cancelled or timed out. Try again." : cause instanceof TypeError ? "The favicon could not be downloaded for cropping. Upload the original image and try again." : cause instanceof Error ? cause.message : "Cropping failed. Try again.");
    } finally {
      clearTimeout(timeout);
      if (stopPreparation) controller.signal.removeEventListener("abort", stopPreparation);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mounted.current) { setBusy(false); onBusyChange(false); }
      }
    }
  }

  return <>
    <button type="button" disabled={busy} className="focus-ring justify-self-start rounded-full border border-black/15 bg-white px-3 py-2 text-xs font-medium hover:bg-[#efefec] disabled:opacity-50" onClick={() => { setError(""); setOpen(true); }}>Crop favicon</button>
    {open ? <MediaCropDialog kind="image" url={url} busy={busy} status={status} error={error} onApply={(selection) => void apply(selection)} onClose={() => { controllerRef.current?.abort(); controllerRef.current = null; setBusy(false); onBusyChange(false); setOpen(false); }} /> : null}
    <p className="text-xs text-[#777]">Crop the icon edges, then save the website to keep the cropped favicon.</p>
  </>;
}
