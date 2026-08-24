export default function Loading() {
  return (
    <div
      data-post-transition-loading
      className="min-h-[100dvh] bg-white px-3 pt-24 sm:px-5"
      aria-label="Loading posts"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-[10px] bg-[#f0f0f0]"
            style={{ aspectRatio: index % 3 === 0 ? "3/4" : "4/3" }}
          />
        ))}
      </div>
    </div>
  );
}
