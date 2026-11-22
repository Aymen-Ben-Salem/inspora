import type { SponsorPromoLabel } from "@/domain/sponsor";

/** Sale pill pinned to the bottom-left of the sponsor card, opposite the SPONSOR badge. */
export function PromoLabelBadge({ label }: { label: SponsorPromoLabel }) {
  return (
    <span
      data-sponsor-promo-label
      className="pointer-events-none absolute bottom-[10px] left-[10px] z-10 inline-flex max-w-[calc(100%-20px)] items-center gap-[5px] rounded-full border py-[4px] pl-[8px] pr-[10px] text-[11px] font-semibold leading-4 tracking-[-0.1px] min-[1800px]:bottom-3 min-[1800px]:left-3 min-[1800px]:text-[12px]"
      style={{
        color: label.textColor,
        backgroundColor: label.backgroundColor,
        borderColor: label.borderColor,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0 min-[1800px]:size-[14px]"
      >
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
      </svg>
      <span className="truncate">{label.text}</span>
    </span>
  );
}
