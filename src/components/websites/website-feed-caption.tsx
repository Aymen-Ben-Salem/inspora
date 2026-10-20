export function WebsiteFeedCaption({
  title,
  description,
  iconUrl,
}: {
  title: string;
  description?: string;
  iconUrl?: string;
}) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      {iconUrl ? (
        <span aria-hidden="true" className="relative block size-[39px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--paper)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconUrl} alt="" width={39} height={39} className="size-full object-scale-down" />
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-[0.5px] border-[#dfdfdf]" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-medium leading-[1.25] tracking-[0.04px] text-[#262626]">{title}</h2>
        {description ? <p className="mt-1 line-clamp-2 text-[13px] leading-[1.3] tracking-[0.04px] text-[#7b7b7b]">{description}</p> : null}
      </div>
    </div>
  );
}
