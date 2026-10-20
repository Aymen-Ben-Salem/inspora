// A 39px frame with a 10px radius and 60% corner smoothing. The straight
// edges ease into the corner arcs; clipping and the outline share this shape.
const outline = [
  "M16 0 H23 C29.496 0 31.401 0 33.54 1.09 A10 10 0 0 1 37.91 5.46 C39 7.599 39 9.504 39 16",
  "V23 C39 29.496 39 31.401 37.91 33.54 A10 10 0 0 1 33.54 37.91 C31.401 39 29.496 39 23 39",
  "H16 C9.504 39 7.599 39 5.46 37.91 A10 10 0 0 1 1.09 33.54 C0 31.401 0 29.496 0 23",
  "V16 C0 9.504 0 7.599 1.09 5.46 A10 10 0 0 1 5.46 1.09 C7.599 0 9.504 0 16 0 Z",
].join(" ");

export const websiteFeedIconClipPath = `path('${outline}')`;

export function WebsiteFeedIcon({ src, inset = false }: { src: string; inset?: boolean }) {
  const size = inset ? 27 : 39;
  return (
    <span data-website-feed-icon aria-hidden="true" className="relative flex size-[39px] shrink-0 items-center justify-center">
      <span className="absolute inset-0 flex items-center justify-center bg-[var(--paper)]" style={{ clipPath: websiteFeedIconClipPath }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size} height={size} className={inset ? "size-[27px] object-scale-down" : "size-full object-scale-down"} />
      </span>
      {/* Keep the hairline out of both clips: subpixel rasterization can move
          its coverage past the image mask or the SVG viewport at some scales. */}
      <svg aria-hidden="true" focusable="false" viewBox="0 0 39 39" className="pointer-events-none absolute inset-0 size-full overflow-visible fill-none">
        <path d={outline} transform="translate(.25 .25) scale(.9871794872)" stroke="#dfdfdf" strokeWidth=".5" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}
