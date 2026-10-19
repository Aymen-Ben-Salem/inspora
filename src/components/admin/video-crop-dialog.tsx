"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { centerVideoCrop, constrainVideoCrop, cropForAspectRatio, moveVideoCrop, resizeVideoCrop, type CropCorner, type VideoCrop, type VideoCropSelection, type VideoDimensions } from "@/features/admin/video-crop";

const ratios = [{ label: "Freeform", value: "free" }, { label: "16:9", value: "16/9" }, { label: "4:3", value: "4/3" }, { label: "Square", value: "1/1" }, { label: "9:16", value: "9/16" }];
const corners: CropCorner[] = ["nw", "ne", "sw", "se"];
const cornerNames = { nw: "top left", ne: "top right", sw: "bottom left", se: "bottom right" };
const buttonClass = "focus-ring rounded-full border border-black/15 px-4 py-2 text-sm disabled:opacity-50";

type CropDialogProps = {
  url: string;
  busy: boolean;
  status: string;
  error: string;
  onApply: (selection: VideoCropSelection) => void;
  onClose: () => void;
};

export function VideoCropDialog(props: CropDialogProps) {
  return <MediaCropDialog {...props} kind="video" />;
}

export function MediaCropDialog({ url, busy, status, error, onApply, onClose, kind }: CropDialogProps & { kind: "video" | "image" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ crop: VideoCrop; mode: "move" | CropCorner; x: number; y: number; scale: number } | null>(null);
  const [bounds, setBounds] = useState<VideoDimensions>();
  const [crop, setCrop] = useState<VideoCrop>();
  const [ratioValue, setRatioValue] = useState(kind === "image" ? "1/1" : "free");
  const [decodeError, setDecodeError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const titleId = useId();
  const helpId = useId();
  const pixelStep = kind === "image" ? 1 : 2;
  const ratio = ratioValue === "free" ? undefined : Number(ratioValue.split("/")[0]) / Number(ratioValue.split("/")[1]);
  const cropStyle = crop && bounds ? { left: `${crop.x / bounds.width * 100}%`, top: `${crop.y / bounds.height * 100}%`, width: `${crop.width / bounds.width * 100}%`, height: `${crop.height / bounds.height * 100}%` } : undefined;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>, mode: "move" | CropCorner) {
    if (!crop || !bounds || busy) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { crop, mode, x: event.clientX, y: event.clientY, scale: bounds.width / stageRef.current!.getBoundingClientRect().width };
  }

  function pointerMove(event: PointerEvent) {
    if (!drag.current || !bounds || busy) return;
    const { crop: initial, mode, x, y, scale } = drag.current;
    const dx = (event.clientX - x) * scale;
    const dy = (event.clientY - y) * scale;
    setCrop(mode === "move" ? moveVideoCrop(initial, dx, dy, bounds, pixelStep) : resizeVideoCrop(initial, mode, dx, dy, bounds, ratio, pixelStep));
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={helpId} onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose(); }} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%_-_24px)] max-w-[960px] overflow-y-auto rounded-2xl bg-white p-5 text-[#222] shadow-2xl backdrop:bg-black/60 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-xl font-medium tracking-[-0.03em]">{kind === "image" ? "Crop favicon" : "Crop recording"}</h2>
        <button type="button" onClick={onClose} className={buttonClass}>{busy ? "Cancel processing" : "Cancel"}</button>
      </div>
      <p id={helpId} className="mt-2 text-sm text-[#777]">Drag the crop box to move it. Drag a corner to resize, or use the arrow keys when a handle is focused.</p>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Crop aspect ratio">
        {ratios.map((option) => <button key={option.value} type="button" disabled={!bounds || busy} aria-pressed={ratioValue === option.value} className={`${buttonClass} ${ratioValue === option.value ? "bg-black text-white" : "bg-white"}`} onClick={() => {
          setRatioValue(option.value);
          if (bounds) setCrop(cropForAspectRatio(bounds, option.value === "free" ? undefined : Number(option.value.split("/")[0]) / Number(option.value.split("/")[1]), pixelStep));
        }}>{option.label}</button>)}
      </div>
      <div className="mt-4 flex min-h-40 items-center justify-center overflow-hidden rounded-xl bg-transparent p-4">
        <div ref={stageRef} className="relative isolate touch-none select-none" style={{ width: bounds ? `min(100%, ${50 * bounds.width / bounds.height}vh)` : "100%", aspectRatio: bounds ? `${bounds.width} / ${bounds.height}` : "16 / 9" }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Favicon crop preview" draggable={false} className="absolute inset-0 size-full object-contain" onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth < 1 || image.naturalHeight < 1) { setDecodeError("This favicon has invalid dimensions."); return; }
              const next = { width: image.naturalWidth, height: image.naturalHeight };
              setBounds(next); setCrop(cropForAspectRatio(next, 1, 1));
            }} onError={() => setDecodeError("The favicon could not be opened. Upload the image again and retry cropping.")} />
          ) : <video ref={videoRef} src={url} muted playsInline loop preload="auto" aria-label="Recording crop preview" className="absolute inset-0 size-full object-contain" onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth < 2 || video.videoHeight < 2) { setDecodeError("This recording has invalid dimensions."); return; }
            const next = { width: video.videoWidth, height: video.videoHeight };
            setBounds(next); setCrop(cropForAspectRatio(next));
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setDecodeError("The recording could not be opened. Upload an MP4 or WebM file and try again.")} />}
          {crop && bounds ? <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]" style={cropStyle} />
          </div>
          <div className="absolute border-2 border-white ring-1 ring-black/30" style={cropStyle}>
            <button type="button" disabled={busy} aria-label="Move crop" className="focus-ring absolute inset-0 size-full cursor-move touch-none" onPointerDown={(event) => startDrag(event, "move")} onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : pixelStep;
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault(); setCrop(moveVideoCrop(crop, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, bounds, pixelStep));
            }}>
              <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/30" /><span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/30" />
              <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/30" /><span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/30" />
            </button>
            {corners.map((corner) => <button key={corner} type="button" disabled={busy} aria-label={`Resize crop ${cornerNames[corner]}`} className={`focus-ring absolute z-10 size-5 touch-none rounded-sm border-2 border-black/30 bg-white shadow ${corner.startsWith("n") ? "-top-2.5" : "-bottom-2.5"} ${corner.endsWith("w") ? "-left-2.5" : "-right-2.5"} ${corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} onPointerDown={(event) => startDrag(event, corner)} onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : pixelStep;
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault(); setCrop(resizeVideoCrop(crop, corner, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, bounds, ratio, pixelStep));
            }} />)}
          </div>
          </> : null}
        </div>
      </div>
      {kind === "video" ? <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={!bounds} className={buttonClass} onClick={() => { const video = videoRef.current!; if (video.paused) void video.play().catch(() => setDecodeError("Playback could not start. Reopen the crop editor and try again.")); else video.pause(); }}>{playing ? "Pause" : "Play"}</button>
        <input aria-label="Seek recording" type="range" min={0} max={duration} step={0.01} value={time} disabled={!duration} className="min-w-0 flex-1 accent-black" onChange={(event) => { const next = Number(event.target.value); videoRef.current!.currentTime = next; setTime(next); }} />
      </div> : null}
      {crop && bounds ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["x", "y", "width", "height"] as const).map((field) => <label key={field} className="grid gap-1 text-xs text-[#666]">{{ x: "Left", y: "Top", width: "Width", height: "Height" }[field]} (px)<input type="number" min={field === "x" || field === "y" ? 0 : pixelStep} max={field === "x" || field === "width" ? bounds.width : bounds.height} step={pixelStep} value={crop[field]} disabled={busy} className="focus-ring h-10 w-full rounded-lg border border-black/15 px-3 text-sm text-black" onChange={(event) => { setRatioValue("free"); setCrop(constrainVideoCrop({ ...crop, [field]: Number(event.target.value) }, bounds, pixelStep)); }} /></label>)}
      </div> : null}
      {error || decodeError ? <p role="alert" className="mt-4 text-sm text-red-700">{error || decodeError}</p> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!crop || !bounds || busy} title="Center the crop without changing its size" className={buttonClass} onClick={() => { if (crop && bounds) setCrop(centerVideoCrop(crop, bounds, pixelStep)); }}>Center crop</button>
          <button type="button" disabled={!bounds || busy} className={buttonClass} onClick={() => { setRatioValue("free"); if (bounds) setCrop(cropForAspectRatio(bounds, undefined, pixelStep)); }}>Reset crop</button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#777]" aria-live="polite">{busy ? status : crop ? `${crop.width} × ${crop.height} px` : kind === "image" ? "Loading favicon…" : "Loading recording…"}</span>
          <button type="button" disabled={!crop || !bounds || Boolean(decodeError) || busy} className="focus-ring rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50" onClick={() => { videoRef.current?.pause(); if (crop && bounds) onApply({ crop, sourceDimensions: bounds }); }}>{busy ? "Processing…" : "Apply crop"}</button>
        </div>
      </div>
    </dialog>
  );
}
