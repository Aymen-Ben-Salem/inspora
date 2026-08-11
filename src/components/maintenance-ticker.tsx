const MAINTENANCE_MESSAGE =
  "SITE UNDER MAINTENANCE • UI UPDATES IN PROGRESS • TEMPORARY VISUAL GLITCHES MAY OCCUR •";

function TickerSegment() {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center">
      <span className="px-5 sm:px-7">{MAINTENANCE_MESSAGE}</span>
      <span className="px-5 sm:px-7">{MAINTENANCE_MESSAGE}</span>
    </div>
  );
}

export function MaintenanceTicker() {
  return (
    <div
      aria-label="Site under maintenance. UI updates are in progress. Temporary visual glitches may occur."
      className="maintenance-ticker flex h-7 items-center overflow-hidden bg-[#111] text-[11px] font-medium tracking-[0.08em] text-white sm:h-8 sm:text-xs"
      role="status"
    >
      <div className="maintenance-ticker-track flex w-max whitespace-nowrap">
        <TickerSegment />
        <TickerSegment />
      </div>
    </div>
  );
}
