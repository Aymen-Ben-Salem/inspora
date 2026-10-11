import { NavbarSkeleton } from "@/components/loading/page-skeletons";

export function SponsorLoading({ label = "Loading sponsorship…", withNavbar = false }: { label?: string; withNavbar?: boolean }) {
  return <>
    {withNavbar ? <NavbarSkeleton desktopAuthOnly /> : null}
    <main role="status" aria-label={label} data-post-transition-loading className="grid min-h-[calc(100dvh-106px)] w-full place-items-center px-4">
      <div className="flex items-center gap-3 text-sm text-[#767676]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5 animate-spin motion-reduce:animate-none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="opacity-20" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>{label}</span>
      </div>
    </main>
  </>;
}
