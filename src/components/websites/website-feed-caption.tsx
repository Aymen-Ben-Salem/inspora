import { WebsiteFeedIcon } from "./website-feed-icon";

export function WebsiteFeedCaption({
  title,
  description,
  iconUrl,
  insetIcon = false,
}: {
  title: string;
  description?: string;
  iconUrl?: string;
  insetIcon?: boolean;
}) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      {iconUrl ? <WebsiteFeedIcon src={iconUrl} inset={insetIcon} /> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-medium leading-[1.25] tracking-[0.04px] text-[#262626]">{title}</h2>
        {description ? <p className="mt-1 line-clamp-2 text-[13px] leading-[1.3] tracking-[0.04px] text-[#7b7b7b]">{description}</p> : null}
      </div>
    </div>
  );
}
