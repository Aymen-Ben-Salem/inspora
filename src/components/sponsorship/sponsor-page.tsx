import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
export function SponsorPage({
  availability,
  enabled,
}: {
  availability: number | null;
  enabled: boolean;
}) {
  const canPrepare = enabled && availability !== null && availability > 0;
  const cta = (
    <>
      {canPrepare ? (
        <Link
          href={"/sponsor/start" as Route}
          className="focus-ring inline-flex min-h-11 items-center rounded-md bg-[#262626] px-[18px] py-3 font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6]"
        >
          Become a sponsor
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center rounded-md bg-[#f0f0f0] px-[18px] py-3 text-[#767676]">
          {enabled && availability === 0
            ? "No seats available"
            : "Preparation unavailable"}
        </span>
      )}
    </>
  );
  return (
    <main className="mx-auto flex max-w-[1000px] flex-col items-center gap-20 px-4 pb-28 pt-8 text-[#262626] sm:px-6">
      <section className="flex flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <span
            role="status"
            className="rounded-[3px] border border-[#e6e6e6] px-3 py-1 text-xs font-semibold text-[#767676]"
          >
            {availability === null
              ? "Seat availability unavailable"
              : `${availability} available ${availability === 1 ? "seat" : "seats"}`}
          </span>
          <h1 className="max-w-[438px] text-[36px] leading-[1.2] font-bold tracking-[-0.8px] sm:text-[40px]">
            Put your product on more creative radars.
          </h1>
          <p className="max-w-[416px] text-base leading-6 tracking-[-0.32px] text-[#767676]">
            Build visibility with creatives discovering new work and tools on
            Inspora.
          </p>
        </div>
        {cta}
        <Link
          href={"/api/sponsorship/intent" as Route}
          className="focus-ring text-sm text-[#767676] underline"
        >
          Returning sponsor? Sign in
        </Link>
      </section>
      <section className="flex w-full flex-col items-center gap-6">
        <p className="max-w-[662px] text-center text-base leading-6 tracking-[-0.32px] text-[#767676]">
          Your brand appears in randomized positions in Design, Websites and
          Logos feeds, beside opened work, and in the header.{" "}
          <span className="text-[#262626]">Three placements</span> keep your
          product in view as creators browse and discover.
        </p>
        <div className="grid w-full gap-5 sm:grid-cols-3">
          {[
            ["feed", "Randomized positions in the archive feeds."],
            ["detail", "Your full wordmark beside opened work."],
            ["header", "Your compact icon in the site header."],
          ].map(([key, label]) => (
            <figure key={key} className="mx-auto w-full max-w-[312px]">
              <Image
                src={`/sponsorship/${key}-placement.png`}
                alt={label}
                width={312}
                height={169}
                className="h-auto w-full"
              />
              <figcaption className="mx-auto mt-3 max-w-[268px] text-center text-base leading-5 tracking-[-0.32px] text-[#767676]">
                {label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="flex flex-col items-center gap-6">
        <p className="max-w-[490px] text-center text-base leading-6 tracking-[-0.32px] text-[#767676]">
          <span className="text-[#262626]">Everything in one place.</span>{" "}
          Prepare your assets and review each placement. Campaign management and
          private reporting become available with paid sponsorship.
        </p>
        <div className="grid gap-[18px] sm:grid-cols-3">
          {[
            [
              "upload",
              "Upload your ads",
              "Prepare your compact icon, full wordmark and optional feed image or video.",
            ],
            [
              "edit",
              "Edit any time",
              "Paid sponsors can update their creative from their private account.",
            ],
            [
              "stats",
              "Placement stats",
              "Paid sponsorship includes measured delivery and outbound engagement.",
            ],
          ].map(([icon, title, description]) => (
            <article
              key={icon}
              className="rounded-md border border-[#e6e6e6] p-4"
            >
              <span className="inline-flex rounded-md bg-[#fafafa] p-1">
                <Image
                  src={`/sponsorship/${icon}.svg`}
                  alt=""
                  width={16}
                  height={16}
                />
              </span>
              <h2 className="mt-2 text-lg font-medium tracking-[0.2px]">
                {title}
              </h2>
              <p className="mt-2 max-w-[216px] text-xs leading-5 tracking-[0.2px] text-[#767676]">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
      <ul className="max-w-[690px] space-y-4 text-base leading-6 text-[#767676]">
        {[
          "Reach designers, founders and independent makers discovering their next tool.",
          "Stay visible with placements built into the way people browse.",
          "Put your brand alongside curated design work.",
          "Promote a business or professional activity; incorporation is not required.",
        ].map((text) => (
          <li key={text} className="flex items-start gap-2.5">
            <Image
              src="/sponsorship/star.svg"
              alt=""
              width={20}
              height={20}
              className="mt-0.5 shrink-0"
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <section className="flex flex-col items-center gap-6 text-center">
        <div>
          <p className="text-base text-[#767676]">
            Only <span className="font-medium text-[#262626]">4 seats.</span>
          </p>
          <p className="mt-2 text-[40px] font-bold tracking-[-0.8px]">
            USD 500 <span className="text-base text-[#767676]">/ 30 days</span>
          </p>
          <p className="mt-3 max-w-[490px] text-sm leading-6 text-[#767676]">
            Base price before applicable tax. Automatically renews every exact
            30 days until cancelled. For business and professional promotion.
          </p>
        </div>
        {cta}
        <p className="text-sm text-[#767676]">
          Payment is currently unavailable. Preparation stays private and uses
          no seat.
        </p>
        <a
          href="mailto:neroodesign@gmail.com"
          className="focus-ring text-sm text-[#767676]"
        >
          or write to <span className="font-medium">neroodesign@gmail.com</span>
        </a>
      </section>
    </main>
  );
}
