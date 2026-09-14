export function FeedSaveOverlay() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[var(--archive-card-overlay-inset)] right-[var(--archive-card-overlay-inset)] z-10 flex size-[var(--archive-card-overlay-size)] items-center justify-center rounded-full bg-[#767676] p-[var(--archive-card-save-padding)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <path
          d="M6.75 4.75A1.75 1.75 0 0 1 8.5 3h7a1.75 1.75 0 0 1 1.75 1.75V21L12 17.5 6.75 21V4.75Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
