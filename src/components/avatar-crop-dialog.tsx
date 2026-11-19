"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  avatarCropFromView,
  clampAvatarView,
  initialAvatarView,
  maxAvatarZoom,
  panAvatarView,
  zoomAvatarView,
  type AvatarCrop,
  type AvatarSource,
  type AvatarView,
} from "@/features/creators/avatar-crop";
import { CREATOR_AVATAR_SIZE_MESSAGE, MIN_CREATOR_AVATAR_SIZE, RECOMMENDED_CREATOR_AVATAR_SIZE } from "@/features/creators/avatar-policy";

const buttonClass = "focus-ring cursor-pointer rounded-full border border-black/15 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Lets a person position and zoom their photo inside a circle before upload.
 * The chosen square is in the photo's own pixels and is never smaller than the
 * minimum avatar size, so the server's size check still holds.
 */
export function AvatarCropDialog({ file, onApply, onCancel, onReject }: {
  file: File;
  onApply: (crop: AvatarCrop) => void;
  onCancel: () => void;
  /** The photo cannot be used (too small or unreadable); the dialog should close. */
  onReject: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; view: AvatarView } | null>(null);
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [source, setSource] = useState<AvatarSource>();
  const [view, setView] = useState<AvatarView>();
  const titleId = useId();
  const helpId = useId();
  const zoomId = useId();

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  // React's wheel listener is passive, so register one that may stop page scrolling.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !source) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => current && zoomAvatarView(source, current, current.zoom * Math.exp(-event.deltaY * 0.002)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [source]);

  const maxZoom = source ? maxAvatarZoom(source) : 1;
  const crop = source && view ? avatarCropFromView(source, view) : undefined;
  // Position the photo from the unrounded view so dragging stays smooth.
  const visibleSize = source && view ? Math.min(source.width, source.height) / view.zoom : 1;
  const imageStyle = source && view ? {
    width: `${source.width / visibleSize * 100}%`,
    height: `${source.height / visibleSize * 100}%`,
    left: `${-(view.centerX - visibleSize / 2) / visibleSize * 100}%`,
    top: `${-(view.centerY - visibleSize / 2) / visibleSize * 100}%`,
  } : undefined;

  function sourcePixelsPerScreenPixel() {
    const width = viewportRef.current?.getBoundingClientRect().width;
    return width ? visibleSize / width : 1;
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!view || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId || !source) return;
    const scale = sourcePixelsPerScreenPixel();
    setView(panAvatarView(source, start.view, -(event.clientX - start.x) * scale, -(event.clientY - start.y) * scale));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!source || !view) return;
    const step = visibleSize * (event.shiftKey ? 0.1 : 0.02);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      setView(panAvatarView(source, view, ...moves[event.key]));
    } else if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      setView(zoomAvatarView(source, view, view.zoom + (event.key === "-" ? -0.1 : 0.1)));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); onCancel(); }}
      // Keep keys inside this dialog: a surrounding modal may close on Escape or trap Tab.
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      }}
      className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%_-_32px)] max-w-[400px] overflow-y-auto rounded-2xl bg-white p-5 text-[#222] shadow-2xl backdrop:bg-black/60 sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-medium tracking-[-0.02em]">Crop your photo</h2>
      <p id={helpId} className="mt-1 text-sm text-[#767676]">Drag to reposition and use the slider to zoom. Arrow keys and + / − also work.</p>

      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-label="Photo position"
        aria-describedby={helpId}
        className="focus-ring relative mx-auto mt-4 aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-xl bg-[#f0f0ee] active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset */}
        <img
          src={url}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute max-w-none ${imageStyle ? "" : "invisible"}`}
          style={imageStyle}
          onLoad={(event) => {
            const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
            if (Math.min(next.width, next.height) < MIN_CREATOR_AVATAR_SIZE) { onReject(CREATOR_AVATAR_SIZE_MESSAGE); return; }
            setSource(next);
            setView(clampAvatarView(next, initialAvatarView(next)));
          }}
          onError={() => onReject("This photo could not be opened. Choose a different image.")}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/80" />
        {!source ? <p className="absolute inset-0 grid place-items-center text-sm text-[#767676]">Loading photo…</p> : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label htmlFor={zoomId} className="text-xs text-[#767676]">Zoom</label>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={maxZoom}
          step={0.01}
          value={view?.zoom ?? 1}
          disabled={!source || maxZoom <= 1}
          onChange={(event) => { if (source && view) setView(zoomAvatarView(source, view, Number(event.target.value))); }}
          className="min-w-0 flex-1 accent-black disabled:opacity-50"
        />
      </div>
      <p className="mt-2 min-h-[2lh] text-xs leading-relaxed text-[#767676]" aria-live="polite">
        {!crop ? "" : crop.size < RECOMMENDED_CREATOR_AVATAR_SIZE
          ? `${crop.size} × ${crop.size} px — under 400 × 400, so it may look slightly soft on sharp screens.`
          : maxZoom <= 1 ? `${crop.size} × ${crop.size} px. This photo is too small to zoom in further.` : `${crop.size} × ${crop.size} px`}
      </p>

      <div className="mt-4 flex justify-end gap-2 border-t border-black/10 pt-4">
        <button type="button" className={buttonClass} onClick={onCancel}>Cancel</button>
        <button
          type="button"
          disabled={!crop}
          className="focus-ring cursor-pointer rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => { if (crop) onApply(crop); }}
        >
          Use photo
        </button>
      </div>
    </dialog>
  );
}
