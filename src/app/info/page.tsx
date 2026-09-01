import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { InfoPageNavigation } from "@/components/info-page-navigation";
import { SITE_EMAIL } from "@/lib/seo";

const description =
  "Learn what Inspora is, how work is selected and credited, and how to request a correction or takedown.";

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
  { href: "#contact", label: "Contact and requests" },
] as const;

export default function InfoPage() {
  return (
    <main aria-label="Info" className="min-h-[100dvh] bg-white text-[#262626]">
      <header className="mx-auto flex w-full max-w-[1705px] items-center justify-between gap-6 px-4 pt-5 sm:px-5 sm:pt-6 xl:px-6 min-[1700px]:px-11 min-[1700px]:pt-7">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" aria-label="Inspora home" className="focus-ring shrink-0">
            <BrandMark responsive />
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-5 text-[13px] leading-none tracking-[0.2px] sm:flex xl:gap-6 min-[1700px]:text-[14px]"
          >
            <Link
              href="/"
              className="focus-ring whitespace-nowrap text-[#777] transition-colors hover:text-[#262626]"
            >
              <span aria-hidden="true">\ </span>
              design
            </Link>
            <Link
              href="/websites"
              className="focus-ring whitespace-nowrap text-[#777] transition-colors hover:text-[#262626]"
            >
              <span aria-hidden="true">\ </span>
              websites
            </Link>
            <Link
              href="/logos"
              className="focus-ring whitespace-nowrap text-[#777] transition-colors hover:text-[#262626]"
            >
              <span aria-hidden="true">\ </span>
              logos
            </Link>
            <a
              href="#contact"
              className="focus-ring whitespace-nowrap text-[#777] transition-colors hover:text-[#262626]"
            >
              <span aria-hidden="true">\ </span>
              contact
            </a>
            <span aria-current="page" className="whitespace-nowrap text-[#262626]">
              <span aria-hidden="true">\ </span>
              info
            </span>
          </nav>
        </div>

        <Link
          href="/"
          className="focus-ring text-[13px] leading-none tracking-[0.2px] text-[#777] transition-colors hover:text-[#262626] sm:hidden"
        >
          Back to design
        </Link>
      </header>

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
            <section id="about" aria-labelledby="about-title" className="scroll-mt-8 pb-16 sm:pb-20">
              <h2
                id="about-title"
                className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]"
              >
                What Inspora is
              </h2>
              <div className="mt-6 max-w-[720px] space-y-5 text-[16px] leading-[1.7] text-[#777] sm:text-[17px]">
                <p>
                  Inspora helps designers, creative professionals, students,
                  and teams find useful visual references. The archive covers
                  web design, branding, product design, motion, illustration,
                  3D, and print.
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
                    are added when approved, without a fixed publishing schedule.
                  </p>
                </div>
                <div>
                  <h3 className="text-[15px] font-medium leading-5 text-[#262626]">
                    Presentation
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[#777]">
                    Categories describe the project&apos;s primary discipline and
                    support browsing. We may update a title, category, credit, or
                    source when better information becomes available.
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
                  or rights holder. Inspora&apos;s role is to curate, organize, and
                  direct visitors to the original source where one is available.
                </p>
                <p>
                  If a creator name, project title, category, or source link is
                  incomplete or incorrect, we welcome a correction. Broken
                  source links can be reported through the same contact route.
                </p>
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
