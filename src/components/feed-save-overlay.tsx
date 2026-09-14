export function FeedSaveOverlay() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[var(--archive-card-overlay-inset)] right-[var(--archive-card-overlay-inset)] z-10 size-[var(--archive-card-overlay-size)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      <svg aria-hidden="true" viewBox="0 0 35 35" fill="none" className="size-full">
        <rect width="35" height="35" rx="17.5" fill="#767676" />
        <path
          d="M21.389 10.5C21.8015 10.5 22.1972 10.6639 22.4889 10.9556C22.7806 11.2473 22.9445 11.643 22.9445 12.0556V23.7225C22.9445 23.8587 22.9087 23.9925 22.8407 24.1105C22.7727 24.2285 22.6749 24.3266 22.5571 24.395C22.4393 24.4633 22.3056 24.4995 22.1694 24.5C22.0332 24.5005 21.8992 24.4651 21.781 24.3976L18.2716 22.3924C18.0366 22.2582 17.7706 22.1876 17.5 22.1876C17.2294 22.1876 16.9634 22.2582 16.7284 22.3924L13.219 24.3976C13.1008 24.4651 12.9668 24.5005 12.8306 24.5C12.6944 24.4995 12.5607 24.4633 12.4429 24.395C12.3251 24.3266 12.2273 24.2285 12.1593 24.1105C12.0913 23.9925 12.0555 23.8587 12.0555 23.7225V12.0556C12.0555 11.643 12.2193 11.2473 12.5111 10.9556C12.8028 10.6639 13.1985 10.5 13.611 10.5H21.389Z"
          stroke="white"
          strokeWidth="1.55558"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
