export function WebsiteFeedIcon({ src, inset = false }: { src: string; inset?: boolean }) {
  const size = inset ? 27 : 39;
  return (
    <span data-website-feed-icon aria-hidden="true" className="website-feed-icon-shape flex size-[39px] shrink-0 items-center justify-center overflow-hidden border-[0.5px] border-[#dfdfdf] bg-[var(--paper)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} className={inset ? "size-[27px] object-scale-down" : "size-full object-scale-down"} />
    </span>
  );
}
