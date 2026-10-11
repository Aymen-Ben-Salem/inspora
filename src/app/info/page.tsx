import type { Metadata } from "next";

import { AnalyticsPreferences } from "@/components/analytics-preferences";
import { SiteNavbar } from "@/components/site-navbar";
import { InfoPageNavigation } from "@/components/info-page-navigation";
import { SITE_EMAIL } from "@/lib/seo";

const description =
  "Learn what Inspora is, how work is selected and credited, how audience analytics works, and how to contact us.";

const contactEmail = SITE_EMAIL.toLowerCase();
const xProfileUrl = "https://x.com/neropursue?s=11";

export const metadata: Metadata = {
  title: "Info",
  description,
  alternates: { canonical: "/info" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Info",
    description,
    url: "/info",
  },
  twitter: {
    title: "Info",
    description,
  },
};

const pageLinks = [
  { href: "#about", label: "About Inspora" },
  { href: "#curation", label: "Editorial and curation" },
  { href: "#attribution", label: "Attribution and ownership" },
  { href: "#sponsorship", label: "Sponsorship policy" },
  { href: "#privacy", label: "Privacy and analytics" },
  { href: "#contact", label: "Contact and requests" },
] as const;

export default function InfoPage() {
  return (
    <main aria-label="Info" className="min-h-[100dvh] bg-white text-[#262626]">
      <SiteNavbar page="info" />

      <div className="mx-auto w-full max-w-[1705px] px-4 pb-20 pt-16 sm:px-5 sm:pb-28 sm:pt-20 xl:px-6 xl:pb-36 xl:pt-24 min-[1700px]:px-11">
        <section aria-labelledby="info-title" className="max-w-[980px]">
          <h1
            id="info-title"
            className="max-w-[850px] text-[32px] font-normal leading-[1.08] tracking-[-0.04em] text-[#262626] sm:text-[40px]"
          >
            About Inspora
          </h1>
          <p className="mt-5 max-w-[680px] text-[18px] font-normal leading-[1.45] tracking-[-0.02em] text-[#777] sm:mt-6 sm:text-[20px]">
            A curated archive of recent visual design inspiration and creative
            work from around the web.
          </p>
        </section>

        <div className="mt-16 grid border-t border-black/10 pt-8 sm:mt-20 lg:grid-cols-12 lg:gap-x-8 lg:pt-10 xl:gap-x-12">
          <aside className="hidden lg:col-span-3 lg:block">
            <InfoPageNavigation links={pageLinks} />
          </aside>

          <article className="lg:col-span-8 lg:col-start-5">
            <section
              id="about"
              aria-labelledby="about-title"
              className="scroll-mt-8 pb-16 sm:pb-20"
            >
              <h2
                id="about-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                What Inspora is
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  Inspora helps designers, creative professionals, students, and
                  teams find useful visual references. The archive covers web
                  design, branding, product design, motion, illustration, 3D,
                  and print.
                </p>
                <p>
                  Each entry presents a project in a consistent browsing format
                  and, where available, provides a direct link to the original
                  source. Inspora organizes and surfaces the work. It does not
                  claim authorship of the projects it features.
                </p>
              </div>
            </section>

            <section
              id="curation"
              aria-labelledby="curation-title"
              className="scroll-mt-8 border-t border-black/10 py-16 sm:py-20"
            >
              <h2
                id="curation-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                Editorial and curation policy
              </h2>
              <p className="mt-6 max-w-[720px] text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                Inspora collects noteworthy visual references that can help
                designers research ideas, approaches, and execution. Inclusion
                is selective rather than automatic.
              </p>

              <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
                <div>
                  <h3 className="text-[15px] font-medium leading-5 text-[#262626]">
                    Selection
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[#777]">
                    We look for strong craft, originality, relevance, clarity of
                    execution, and usefulness as a design reference. Projects
                    are added when approved, without a fixed publishing
                    schedule.
                  </p>
                </div>
                <div>
                  <h3 className="text-[15px] font-medium leading-5 text-[#262626]">
                    Presentation
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[#777]">
                    Categories describe the project&apos;s primary discipline
                    and support browsing. We may update a title, category,
                    credit, or source when better information becomes available.
                  </p>
                </div>
                <div>
                  <h3 className="text-[15px] font-medium leading-5 text-[#262626]">
                    Sources
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[#777]">
                    Creator names and original sources are identified where they
                    are known. The View original link is intended to send
                    visitors to the originating project or creator page.
                  </p>
                </div>
                <div>
                  <h3 className="text-[15px] font-medium leading-5 text-[#262626]">
                    Sponsored placements
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[#777]">
                    Inspora may publish paid placements. Sponsored entries are
                    clearly marked Sponsor so they can be distinguished from
                    editorial selections.
                  </p>
                </div>
              </div>
            </section>

            <section
              id="attribution"
              aria-labelledby="attribution-title"
              className="scroll-mt-8 border-t border-black/10 py-16 sm:py-20"
            >
              <h2
                id="attribution-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                Attribution and ownership
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  Featured work remains the property of its respective creator
                  or rights holder. Inspora&apos;s role is to curate, organize,
                  and direct visitors to the original source where one is
                  available.
                </p>
                <p>
                  If a creator name, project title, category, or source link is
                  incomplete or incorrect, we welcome a correction. Broken
                  source links can be reported through the same contact route.
                </p>
              </div>
            </section>

            <section
              id="sponsorship"
              aria-labelledby="sponsorship-title"
              className="scroll-mt-8 border-t border-black/10 py-16 sm:py-20"
            >
              <h2
                id="sponsorship-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                Sponsorship policy
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  USD 500 or EUR 500 before applicable tax. One-time covers one
                  calendar month from verified payment, with no automatic
                  renewal. Monthly renews every calendar month until cancelled
                  and must be selected explicitly. For business and professional
                  promotion.
                </p>
                <p>
                  Preparation stays private and uses no seat. Checkout reserves
                  an available seat for 30 minutes; verified payment activates
                  your campaign. One-time ends and releases its seat at expiry.
                  Monthly cancellation preserves the paid period; a failed
                  monthly renewal pauses promotion at expiry and holds your seat
                  for 72 hours. Test checkout remains unavailable until
                  configured.
                </p>
              </div>
            </section>

            <section
              id="privacy"
              aria-labelledby="privacy-title"
              className="scroll-mt-8 border-t border-black/10 py-16 sm:py-20"
            >
              <h2
                id="privacy-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                Privacy and audience analytics
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  Inspora measures public page views and sponsorship delivery
                  with its own accepted-event records. PostHog provides a
                  separate audience source where configured.
                  Private account, sponsorship and administrator pages are
                  excluded.
                </p>
                <p>
                  Analytics visitor identifiers are not stored in cookies or
                  browser storage. Our monthly anonymous counting key uses
                  transient trusted network and browser information; raw IP
                  addresses, full browser identifiers, account identities and
                  sensitive URLs are not retained in our event records. Shared
                  networks can count together, and changing networks or browsers
                  can count again. Monthly resets can count a returning visitor
                  again in a range crossing months. Missing trustworthy identity
                  contributes delivery, with no invented unique visitor.
                </p>
                <p>
                  A sponsor impression requires at least half the placement to
                  be visible continuously for one foreground second. Clicks
                  count actual outbound activations. Unique visitors counts
                  qualifying impression identities for sponsors and page-view
                  identities for site audience; it is an estimate, not an exact
                  count of people. Video figures measure the displayed preview
                  and exclude repeat loops. A click does not prove a destination
                  visit, signup or sale.
                </p>
                <p>
                  Country uses trusted deployment network geolocation, with an
                  Unknown bucket when unavailable. VPNs, relays and incomplete
                  mapping affect it; this does not establish a visitor&apos;s
                  physical location or nationality. We retain coarse devices and
                  sanitized referring domains. PostHog resets
                  anonymous identifiers daily, so their longer-range reach
                  cannot replace our monthly sponsorship reach. Work opens use a
                  tab-only session that resets on reload or after thirty minutes
                  of inactivity.
                </p>
                <p>
                  Accepted raw events are proposed for ninety-day retention only
                  after whole-range and closed-period summaries are finalized.
                  Aggregate reports and history remain for up to twenty-four
                  months. Operational monthly secrets are destroyed one hour
                  after rollover; retained recovery backups may still contain
                  encrypted copies until those backups expire. Backup access is
                  restricted, and secret destruction does not erase those
                  copies.
                </p>
                <p>
                  Separate minute-scoped abuse-control keys bound new event and
                  retry receipts. They never supply reach figures and expire
                  after one hour; raw network addresses are not retained.
                </p>
                <p>
                  We do not use this data for targeted advertising or cross-site
                  tracking. Person profiles, session replay, heatmaps, and
                  automatic interaction capture are disabled. Sponsors may
                  receive aggregate delivery and audience figures; they do not
                  receive browser identifiers or event-level analytics data.
                </p>
                <p>
                  Do Not Track, Global Privacy Control and the control below
                  disable all analytics collectors. A functional preference
                  cookie stores only this choice, not a visitor identifier. You
                  can disable analytics for this browser below. The preference
                  remains until you enable analytics again or clear this
                  site&apos;s browser data. PostHog&apos;s own data handling is
                  described in its{" "}
                  <a
                    href="https://posthog.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring text-[#262626] underline decoration-black/25 underline-offset-4 transition-colors hover:decoration-black"
                  >
                    privacy notice
                  </a>
                  .
                </p>
              </div>

              <div className="mt-8">
                <AnalyticsPreferences />
              </div>
            </section>

            <section
              id="contact"
              aria-labelledby="contact-title"
              className="scroll-mt-8 border-t border-black/10 pt-16 sm:pt-20"
            >
              <h2
                id="contact-title"
                className="max-w-[680px] text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                Contact, corrections, and takedowns
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  For a general question, an incorrect credit or source, or a
                  rights-holder removal request, email the Inspora team.
                </p>
                <p>
                  For corrections or removals, include the Inspora post URL, the
                  original source URL if available, what should be corrected or
                  removed, and your relationship to the work. We will review the
                  request and may ask for information needed to verify it.
                </p>
              </div>

              <div className="mt-9 grid max-w-[620px] gap-3 sm:grid-cols-2">
                <a
                  href={xProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex min-h-12 items-center justify-center border border-black/15 px-5 py-3 text-[14px] leading-5 text-[#262626] transition-colors hover:bg-[#f5f5f5] active:translate-y-px"
                >
                  Continue on X
                </a>
                <a
                  href={`mailto:${contactEmail}?subject=Inspora%20correction%20or%20removal%20request`}
                  className="focus-ring inline-flex min-h-12 max-w-full items-center justify-center bg-[#262626] px-5 py-3 text-[14px] leading-5 text-white transition-colors hover:bg-[#111] active:translate-y-px"
                >
                  <span className="break-all text-center">{contactEmail}</span>
                </a>
              </div>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}
