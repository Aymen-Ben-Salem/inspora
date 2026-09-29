import type { ReactNode } from "react";

// Synchronous server fallbacks: no requests, media, observers or animation code.
function Block({ className = "" }: { className?: string }) {
  return <div className={`bg-[#f0f0f0] ${className}`} />;
}

function LoadingPage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-post-transition-loading role="status" aria-label={label} className="min-h-[100dvh] w-full overflow-x-clip bg-white">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true"><NavbarSkeleton />{children}</div>
    </div>
  );
}

function NavbarSkeleton() {
  return (
    <div className="archive-frame py-[var(--archive-header-pad-y)]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
        <Block className="h-[29px] w-8" />
        <div className="hidden h-[var(--archive-nav-height)] items-center gap-6 lg:flex">
          {[0, 1, 2].map((index) => <Block key={index} className="h-4 w-20" />)}
        </div>
        <div className="col-start-3 flex items-center justify-end gap-3">
          <Block className="h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)]" />
          <Block className="size-10 lg:hidden" />
        </div>
      </div>
    </div>
  );
}

function CategorySkeleton({ profile = false }: { profile?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 gap-[var(--archive-control-gap)] overflow-hidden ${profile ? "py-2" : "py-[var(--archive-filter-pad-y)]"}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Block key={index} className={profile ? "h-[41px] w-[104px] shrink-0" : "h-[var(--archive-control-height)] w-[var(--archive-category-width)] shrink-0"} />
      ))}
    </div>
  );
}

function WorkSkeleton({ square = false }: { square?: boolean }) {
  // Share feed-grid's breakpoints without its measuring client. Independent
  // columns approximate masonry without empty rows or layout measurements.
  return (
    <div className="feed-grid">
      {["", "hidden min-[460px]:block", "hidden min-[760px]:block", "hidden min-[1120px]:block"].map((visibility, index) => (
        <div key={index} className={`space-y-[var(--archive-card-gap)] ${visibility}`}>
          <Block className={square ? "aspect-square" : index % 2 ? "aspect-[3/4]" : "aspect-[4/3]"} />
          <Block className={square ? "aspect-square" : index % 2 ? "aspect-[4/3]" : "aspect-[3/4]"} />
        </div>
      ))}
    </div>
  );
}

function WebsiteSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-[35px] xl:gap-y-10">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index}>
          <Block className="aspect-video w-full" />
          <div className="mt-5 flex items-start gap-2.5">
            <Block className="size-[39px] shrink-0" />
            <div className="min-w-0 flex-1">
              <Block className="h-5 w-2/3" />
              <Block className="mt-1 h-[18px] w-full max-w-[420px]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ArchiveSkeleton({ kind = "design" }: { kind?: "design" | "logos" | "websites" | "saved" }) {
  const searchable = kind === "logos" || kind === "websites";
  return (
    <LoadingPage label={kind === "saved" ? "Loading saved work" : `Loading ${kind}`}>
      <div className="archive-frame pb-16 pt-[var(--archive-header-gap)]">
        {kind === "saved" ? (
          <div className="flex items-center" style={{ height: "calc(var(--archive-heading-size) * 1.5)" }}><Block className="h-4 w-48" /></div>
        ) : kind !== "design" ? (
          <p className="text-[length:var(--archive-heading-size)] font-normal leading-normal tracking-[-0.02em] text-[#767676] md:whitespace-nowrap">
            A <span className="text-[#262626]">curated</span> archive of recent{" "}
            <span className="text-[#262626]">visual design</span> inspiration and{" "}
            <span className="text-[#262626]">creative work</span>.
          </p>
        ) : null}
        {searchable ? (
          <div className="mt-[var(--archive-description-gap)] flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-[var(--archive-search-gap)]">
              <Block className="h-[var(--archive-control-height)] w-full shrink-0 lg:w-[var(--archive-search-width)]" />
              <div className="flex min-w-0 flex-wrap gap-2">
                {Array.from({ length: kind === "logos" ? 4 : 3 }, (_, index) => <Block key={index} className="h-[var(--archive-control-height)] w-[var(--archive-filter-width)]" />)}
              </div>
            </div>
            <Block className={`h-[var(--archive-control-height)] shrink-0 self-end lg:self-auto ${kind === "logos" ? "w-[calc(var(--archive-switch-width)*2)]" : "w-28"}`} />
          </div>
        ) : (
          <div className={`flex min-w-0 items-center justify-between gap-3 ${kind === "design" ? "" : "mt-[var(--archive-description-gap)]"}`}>
            <CategorySkeleton />
            {kind === "design" ? <Block className="h-[var(--archive-control-height)] w-28 shrink-0" /> : null}
          </div>
        )}
        <div className="pt-[var(--archive-feed-gap)]">
          {kind === "websites" ? <WebsiteSkeleton /> : <WorkSkeleton square={kind === "logos"} />}
        </div>
      </div>
    </LoadingPage>
  );
}

export function ProfileSkeleton({ owner = false }: { owner?: boolean }) {
  return (
    <LoadingPage label={owner ? "Loading your profile" : "Loading creator profile"}>
      <div className="archive-frame mt-8 mb-[18px] flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-[18px]">
          <Block className="size-24 shrink-0 rounded-full sm:size-[174px]" />
          <div className="flex min-w-0 flex-col gap-4">
            <Block className="h-[18px] w-12" />
            <div>
              <Block className="h-[42px] w-40 max-w-full sm:h-[60px] sm:w-60" />
              <Block className="mt-2 h-6 w-28" />
            </div>
            <Block className="h-6 w-36" />
          </div>
        </div>
        {owner ? <Block className="ml-auto h-12 w-48" /> : null}
      </div>
      <div className="archive-frame pb-28">
        <CategorySkeleton profile />
        <div className="pt-[18px]"><WorkSkeleton /></div>
      </div>
    </LoadingPage>
  );
}

export function PostDetailSkeleton({ standalone = false }: { standalone?: boolean }) {
  return (
    <div data-post-transition-loading role="status" aria-label="Loading work details" className={standalone ? "fixed inset-0 z-50 bg-gradient-to-b from-white to-[#d2d1d1]" : "h-[100dvh] w-full"}>
      <span className="sr-only">Loading work details</span>
      <div aria-hidden="true" className="flex h-[100dvh] w-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-[55dvh] min-w-0 flex-1 items-center justify-center p-5 lg:h-full lg:p-10">
          <Block className="aspect-[4/3] max-h-[80dvh] w-full max-w-[800px] rounded-[10px]" />
        </div>
        <div className="detail-fit-sidebar w-full shrink-0 bg-white lg:h-full lg:w-[min(29.583333vw,426px)]">
          <div className="detail-fit-sidebar-inner flex h-full flex-col px-5 py-5 sm:px-7">
            <div className="detail-fit-nav flex h-10 items-center justify-between"><Block className="size-8 rounded-full" /><Block className="h-8 w-20" /></div>
            <div className="detail-fit-sidebar-content flex-1 pt-6 sm:pt-7">
              <div className="detail-fit-groups flex flex-col gap-6">
                <Block className="h-8 w-3/4" />
                <div className="flex items-center gap-3"><Block className="size-9 rounded-full" /><Block className="h-4 w-32" /></div>
                <div className="space-y-2"><Block className="h-4 w-full" /><Block className="h-4 w-5/6" /><Block className="h-4 w-2/3" /></div>
                <div className="detail-fit-metadata space-y-3">{[0, 1, 2, 3].map((index) => <Block key={index} className="h-6 w-full" />)}</div>
                <Block className="h-9 w-full" />
              </div>
            </div>
            <div className="detail-fit-footer mt-auto pt-8"><Block className="h-10 w-full" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InfoSkeleton() {
  return (
    <LoadingPage label="Loading information">
      <div className="mx-auto w-full max-w-[1705px] px-4 pb-20 pt-16 sm:px-5 sm:pb-28 sm:pt-20 xl:px-6 xl:pb-36 xl:pt-24 min-[1700px]:px-11">
        <Block className="h-9 w-64 sm:h-11" />
        <div className="mt-5 max-w-[680px] space-y-2 sm:mt-6"><Block className="h-6 w-full" /><Block className="h-6 w-2/3" /></div>
        <div className="mt-16 grid border-t border-black/10 pt-8 sm:mt-20 lg:grid-cols-12 lg:gap-x-8 lg:pt-10 xl:gap-x-12">
          <div className="hidden space-y-5 lg:col-span-3 lg:block">
            {[0, 1, 2, 3, 4].map((index) => <Block key={index} className="h-5 w-3/4" />)}
          </div>
          <div className="lg:col-span-8 lg:col-start-5">
            <Block className="h-9 w-56" />
            <div className="mt-6 max-w-[720px] space-y-3">
              {[0, 1, 2, 3, 4, 5].map((index) => <Block key={index} className={index % 3 === 2 ? "h-5 w-3/4" : "h-5 w-full"} />)}
            </div>
          </div>
        </div>
      </div>
    </LoadingPage>
  );
}
