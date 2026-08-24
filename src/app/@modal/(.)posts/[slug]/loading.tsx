export default function LoadingPostModal() {
  return (
    <div
      data-post-transition-loading
      role="status"
      aria-live="polite"
      className="pointer-events-none flex h-[100dvh] w-full items-center justify-center"
    >
      <span className="sr-only">Loading post</span>
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-full border border-black/10 bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-black/55" />
      </span>
    </div>
  );
}
