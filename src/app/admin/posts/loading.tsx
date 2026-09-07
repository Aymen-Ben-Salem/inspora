export default function LoadingAdminPosts() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading admin posts" className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
        <div>
          <div className="h-12 w-36 animate-pulse rounded-lg bg-black/10" />
          <div className="mt-3 h-5 w-56 animate-pulse rounded-full bg-black/10" />
        </div>
        <div className="h-11 w-52 animate-pulse rounded-full bg-black/10" />
      </header>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-white p-5">
            <div className="aspect-[4/3] animate-pulse rounded-xl bg-black/10" />
            <div className="mt-5 h-6 w-2/3 animate-pulse rounded-full bg-black/10" />
            <div className="mt-2 h-4 w-1/3 animate-pulse rounded-full bg-black/10" />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading posts</span>
    </div>
  );
}
