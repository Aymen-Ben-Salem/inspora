import { NavbarSkeleton } from "@/components/loading/page-skeletons";

function Block({ className }: { className: string }) {
  return <div className={`rounded-[3px] bg-[#f0f0f0] ${className}`} />;
}

// Synchronous placeholders mirror the offer; no availability requests or media.
export function SponsorPageSkeleton({
  withNavbar = false,
}: {
  withNavbar?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading sponsorship"
      data-post-transition-loading
    >
      <span className="sr-only">Loading sponsorship</span>
      <div aria-hidden="true">
        {withNavbar && <NavbarSkeleton desktopAuthOnly />}
        <div
          data-sponsor-skeleton
          className="mx-auto flex w-full max-w-[1046px] flex-col items-center gap-20 px-4 pb-5 pt-3 lg:min-h-[1708px] lg:px-[45px] lg:pt-[11px]"
        >
          <div className="flex w-full flex-col items-center gap-8">
            <div className="flex w-full flex-col items-center gap-4">
              <Block className="h-[25px] w-[133px]" />
              <div className="flex h-[129.6px] w-full max-w-[438px] flex-col items-center justify-center gap-3 sm:h-24">
                <Block className="h-9 w-full" />
                <Block className="h-9 w-5/6" />
                <Block className="h-9 w-2/3 sm:hidden" />
              </div>
              <div className="flex h-[57px] w-full max-w-[416px] flex-col items-center justify-center gap-2 sm:h-[38px]">
                <Block className="h-3 w-full" />
                <Block className="h-3 w-5/6" />
                <Block className="h-3 w-2/3 sm:hidden" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Block className="h-[43px] w-[181px] rounded-md" />
              <Block className="h-5 w-[162px]" />
            </div>
          </div>
          <div className="grid w-full max-w-[576px] grid-cols-3 gap-2 sm:gap-[18px]">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex flex-col items-center gap-1 rounded-md border border-[#e6e6e6] p-3 sm:p-[15px]"
              >
                <Block className="h-[27px] w-2/3" />
                <Block className="h-[30px] w-full sm:h-[15px]" />
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col items-center gap-6">
            <Block className="h-[120px] w-full max-w-[662px] sm:h-[60px]" />
            <div className="grid w-full justify-items-center gap-6 lg:grid-cols-3 lg:gap-[10px]">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex w-full max-w-[312px] flex-col items-center gap-[10px]"
                >
                  <Block className="h-[168.91px] w-full rounded-none" />
                  <Block className="h-[38px] w-full max-w-[244px]" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-6">
            <Block className="h-20 w-full max-w-[490px] sm:h-[60px]" />
            <div className="grid w-full justify-items-center gap-[18px] lg:w-auto lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex w-[248px] max-w-full flex-col items-start gap-2 rounded-md border border-[#e6e6e6] p-[15px]"
                >
                  <Block className="size-6 rounded-md" />
                  <Block className="h-[22px] w-2/3" />
                  <Block className="h-[45px] w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex w-full max-w-[670px] flex-col gap-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-2.5">
                <Block className="size-5 shrink-0" />
                <Block
                  className={`w-full sm:h-[32.544px] md:h-5 ${index === 2 ? "h-[32.544px]" : "h-[48.816px]"}`}
                />
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <Block className="h-5 w-[90px]" />
              <Block className="h-[39px] w-[183px]" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Block className="h-[43px] w-[181px] rounded-md" />
              <Block className="h-5 w-[262px] max-w-full" />
            </div>
            <Block className="h-5 w-[215px] max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
