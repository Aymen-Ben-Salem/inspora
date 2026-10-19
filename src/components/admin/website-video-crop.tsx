"use client";

import { useEffect, useRef, useState } from "react";
import { VideoCropDialog } from "./video-crop-dialog";
import type { VideoCrop } from "@/features/admin/video-crop";
import { MAX_VIDEO_UPLOAD_BYTES, type UploadedAdminMedia } from "@/features/admin/media-upload";
import { prepareAndUploadMedia } from "@/features/media/prepare-and-upload";

export function WebsiteVideoCrop({ url, onUploaded, onBusyChange }: {
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

  async function apply(crop: VideoCrop) {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); onBusyChange(true); setError(""); setStatus("Opening original recording…");
    // Bound a stalled source download independently of conversion's own timeout.
    const timeout = setTimeout(() => controller.abort(), 60000);
    let stopConversion: (() => void) | undefined;
    try {
      const response = await fetch(url, { signal: controller.signal, mode: "cors" });
      if (!response.ok) throw new Error("The original recording could not be downloaded. Upload the video again and retry cropping.");
      if (Number(response.headers.get("content-length")) > MAX_VIDEO_UPLOAD_BYTES) throw new Error("Website recordings must be 50 MB or smaller.");
      const blob = await response.blob();
      clearTimeout(timeout);
      controller.signal.throwIfAborted();
      if (blob.size > MAX_VIDEO_UPLOAD_BYTES) throw new Error("Website recordings must be 50 MB or smaller.");
      const webm = blob.type.split(";")[0] === "video/webm" || /\.webm(?:\?|$)/i.test(url);
      const file = new File([blob], `website-recording.${webm ? "webm" : "mp4"}`, { type: webm ? "video/webm" : "video/mp4" });
      const result = await prepareAndUploadMedia(file, "website-recording", undefined, (stage) => {
        if (mounted.current && !controller.signal.aborted) setStatus(stage === "loading-converter" ? "Loading video editor…" : stage === "uploading" ? "Uploading cropped recording…" : stage === "verifying" ? "Checking upload…" : stage === "signing" ? "Preparing upload…" : "Processing crop and preview…");
      }, (conversion) => {
        stopConversion = () => conversion.abort();
        controller.signal.addEventListener("abort", stopConversion, { once: true });
        if (controller.signal.aborted) conversion.abort();
      }, crop);
      if (mounted.current && !controller.signal.aborted) { setOpen(false); onUploaded(result); }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause instanceof TypeError ? "The recording could not be downloaded for cropping. Upload the original video and try again." : cause instanceof Error ? cause.message : "Cropping failed. Upload the original recording and try again.");
      if (mounted.current && controller.signal.aborted) setError("Cropping was cancelled or timed out. Try again.");
    } finally {
      clearTimeout(timeout);
      if (stopConversion) controller.signal.removeEventListener("abort", stopConversion);
      controllerRef.current = null;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }

  return <>
    <button type="button" disabled={busy} className="focus-ring justify-self-start rounded-full border border-black/15 bg-white px-3 py-2 text-xs font-medium hover:bg-[#efefec] disabled:opacity-50" onClick={() => { setError(""); setOpen(true); }}>Crop recording</button>
    {open ? <VideoCropDialog url={url} busy={busy} status={status} error={error} onApply={(crop) => void apply(crop)} onClose={() => { controllerRef.current?.abort(); setOpen(false); }} /> : null}
    <p className="text-xs text-[#777]">Crop the picture edges, then save the website to keep the cropped recording.</p>
  </>;
}
