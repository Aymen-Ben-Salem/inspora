export default function LoadingAdminPosts() {
  return (
    <div role="status" aria-label="Loading admin posts" className="grid gap-8">
      <span className="sr-only">Loading posts</span>
      <div aria-hidden="true" className="grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
          <div>
            <div className="h-10 w-36 rounded-lg bg-black/10 sm:h-12" />
            <div className="mt-3 h-5 w-56 rounded-full bg-black/10" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-40 rounded-full bg-black/10" />
            <div className="h-11 w-28 rounded-full bg-black/10" />
          </div>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="bg-white">
              <div className="aspect-[4/3] bg-black/10" />
              <div className="p-5">
                <div className="h-7 w-2/3 rounded-full bg-black/10" />
                <div className="mt-1 h-5 w-1/3 rounded-full bg-black/10" />
                <div className="mt-5 h-4 w-3/4 rounded-full bg-black/10" />
                <div className="mt-5 flex gap-2">
                  <div className="h-9 w-16 rounded-full bg-black/10" />
                  <div className="h-9 w-24 rounded-full bg-black/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
