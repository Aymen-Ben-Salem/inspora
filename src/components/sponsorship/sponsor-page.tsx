import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

const placements = [
  ["feed", "A presence in our most popular design feeds.", 244],
  [
    "detail",
    "Your logo stays visible in the sidebar whenever work is open.",
    244,
  ],
  ["header", "Your brand appears in the header across Inspora.", 268],
] as const;
const features = [
  [
    "upload",
    "Upload Your Ads",
    "Upload your logo, brand icon, and the work featured in your design feed placement.",
  ],
  [
    "edit",
    "Edit Any Time",
    "Update your logo, icon, or featured work whenever you want—changes go live instantly.",
  ],
  [
    "stats",
    "Live Stats",
    "See views and clicks across your placements, tracked live from your dashboard.",
  ],
] as const;
const benefits = [
  "Reach designers, founders, and indie makers already searching for their next great tool.",
  "Stay visible across Inspora with placements built into the way people naturally browse.",
  "Put your brand alongside curated design work without interrupting the experience.",
  "Get repeated exposure across feeds, work, and pages — not just a single ad impression.",
];

export function SponsorPage({
  availability,
  enabled,
}: {
  availability: number | null;
  enabled: boolean;
}) {
  const canPrepare = enabled && availability !== null && availability > 0;
  const ctaClass =
    "inline-flex min-h-[43px] items-center justify-center rounded-md px-[18px] py-3 text-base font-medium leading-[19px] tracking-[0.2px]";
  const cta = canPrepare ? (
    <Link
      href={"/sponsor/start" as Route}
      className={`${ctaClass} focus-ring bg-[#262626] text-white shadow-[0_1px_1px_#e6e6e6]`}
    >
      Become a sponsor
    </Link>
  ) : (
    <span className={`${ctaClass} bg-[#f0f0f0] text-[#767676]`}>
      {enabled && availability === 0
        ? "No seats available"
        : "Preparation unavailable"}
    </span>
  );
  return (
    <main className="mx-auto flex w-full max-w-[1046px] flex-col items-center gap-20 px-4 pb-5 pt-3 text-[#262626] lg:min-h-[1708px] lg:px-[45px] lg:pt-[11px]">
      <section className="flex w-full flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-[3px] border border-[#e6e6e6] px-3 py-1 text-xs font-bold leading-[normal] tracking-[-0.24px] text-[#767676]"
          >
            {availability !== null && availability > 0 && (
              <Image
                src="/sponsorship/availability.svg"
                alt=""
                width={6}
                height={6}
                className="-m-px"
              />
            )}
            {availability === null
              ? "Seat availability unavailable"
              : `${availability} available ${availability === 1 ? "spot" : "spots"}`}
          </span>
          <h1 className="max-w-[438px] text-[36px] font-bold leading-[1.2] tracking-[-0.8px] sm:text-[40px]">
            Put your product on more creative radars.
          </h1>
          <p className="max-w-[416px] text-base font-medium leading-[19px] tracking-[-0.32px] text-[#767676]">
            Boost your visibility, build credibility, and reach creatives
            actively discovering new tools.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          {cta}
          <Link
            href={"/api/sponsorship/intent" as Route}
            className="focus-ring text-xs leading-5 text-[#767676] underline"
          >
            Returning sponsor? Sign in
          </Link>
        </div>
      </section>
      <section
        aria-label="Audience statistics"
        className="grid w-full max-w-[576px] grid-cols-3 gap-2 sm:gap-[18px]"
      >
        {["visitors / month", "page views / month", "average time on site"].map(
          (label) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-md border border-[#e6e6e6] p-3 text-center sm:p-[15px]"
            >
              <span
                className="text-[22px] font-bold leading-[27px] tracking-[0.2px]"
                aria-label="Verified figure unavailable"
              >
                —
              </span>
              <span className="text-xs leading-[normal] tracking-[0.2px] text-[#767676]">
                {label}
              </span>
            </div>
          ),
        )}
      </section>
      <section className="flex w-full flex-col items-center gap-6">
        <p className="max-w-[662px] text-center text-base leading-5 tracking-[-0.32px] text-[#767676]">
          Your brand gets a randomized spot in our design feeds, a dedicated
          presence beside opened work, and visibility in the header across
          Inspora. <span className="text-[#262626]">Three placements</span>{" "}
          designed to keep your product{" "}
          <span className="text-[#262626]">in front of creators</span> while
          they browse and discover.
        </p>
        <div className="grid w-full justify-items-center gap-6 lg:grid-cols-3 lg:gap-[10px]">
          {placements.map(([key, label, captionWidth]) => (
            <figure
              key={key}
              className="flex w-full max-w-[312px] flex-col items-center gap-[10px]"
            >
              <Image
                src={`/sponsorship/${key}-placement.png`}
                alt={label}
                width={312}
                height={169}
                className="block h-[168.91px] w-full"
              />
              <figcaption
                style={{ maxWidth: captionWidth }}
                className="text-center text-base leading-[19px] tracking-[-0.32px] text-[#767676]"
              >
                {label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="flex w-full flex-col items-center gap-6">
        <p className="max-w-[490px] text-center text-base leading-5 tracking-[-0.32px] text-[#767676]">
          <span className="text-[#262626]">Everything in one place.</span>{" "}
          Upload your sponsor assets, make changes whenever you need, and keep
          an eye on how each placement is performing from your dashboard.
        </p>
        <div className="grid w-full justify-items-center gap-[18px] lg:w-auto lg:grid-cols-3">
          {features.map(([icon, title, description]) => (
            <article
              key={icon}
              className="flex w-[248px] max-w-full flex-col items-start gap-2 rounded-md border border-[#e6e6e6] p-[15px]"
            >
              <span className="inline-flex rounded-md bg-[#fafafa] p-1">
                <Image
                  src={`/sponsorship/${icon}.svg`}
                  alt=""
                  width={16}
                  height={16}
                />
              </span>
              <h2 className="text-lg font-medium leading-[22px] tracking-[0.2px]">
                {title}
              </h2>
              <p className="text-xs font-medium leading-[normal] tracking-[0.2px] text-[#767676]">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
      <ul className="flex max-w-full flex-col items-start gap-4 text-base leading-[1.017] tracking-[-0.32px] text-[#767676]">
        {benefits.map((text) => (
          <li key={text} className="flex items-center gap-2.5">
            <Image
              src="/sponsorship/star.svg"
              alt=""
              width={20}
              height={20}
              className="shrink-0"
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <section className="flex w-full flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-base font-medium leading-5 tracking-[-0.32px] text-[#767676]">
            Only <span className="text-[#262626]">4 slots.</span>
          </p>
          <p className="flex items-end gap-[6px] font-bold leading-[normal]">
            <span className="h-[39px] text-[40px] tracking-[-0.8px]">500$</span>
            <span className="text-base tracking-[-0.32px] text-[#767676]">
              / 30 days
            </span>
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          {cta}
          <a
            href="mailto:neroodesign@gmail.com"
            className="focus-ring text-base leading-5 tracking-[-0.32px] text-[#767676]"
          >
            or write to{" "}
            <span className="font-medium">neroodesign@gmail.com</span>
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs leading-5 text-[#767676]">
          <a href="/info#sponsorship" className="focus-ring underline">
            Policy
          </a>
          <Link
            href={"/api/sponsorship/intent" as Route}
            className="focus-ring underline"
          >
            Returning sponsor? Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
