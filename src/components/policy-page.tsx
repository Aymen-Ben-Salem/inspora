import Link from "next/link";

import { AnalyticsPreferences } from "@/components/analytics-preferences";
import { SiteNavbar } from "@/components/site-navbar";
import type { SitePolicy } from "@/lib/site-policies";
import { SITE_EMAIL } from "@/lib/seo";

export function PolicyPage({ policy }: { policy: SitePolicy }) {
  return (
    <main aria-label={policy.title} className="min-h-[100dvh] bg-white text-[#262626]">
      <SiteNavbar page="info" />
      <article className="mx-auto max-w-[920px] px-5 pb-24 pt-20 sm:px-8 sm:pt-28">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.04em] sm:text-[40px]">
          {policy.title}
        </h1>
        <p className="mt-4 text-sm text-[#777]">Last updated November 1, 2026</p>
        <nav aria-label="Policy pages" className="mt-6 flex flex-wrap gap-5 text-sm">
          <Link className="focus-ring underline underline-offset-4" href="/info">About Inspora</Link>
          <Link className="focus-ring underline underline-offset-4" href="/privacy">Privacy policy</Link>
          <Link className="focus-ring underline underline-offset-4" href="/terms">Terms of service</Link>
        </nav>
        {policy.sections.map((section) => (
          <section key={section.id} aria-labelledby={`policy-${section.id}`} className="mt-12 border-t border-black/10 pt-8">
            <h2 id={`policy-${section.id}`} className="text-2xl font-normal tracking-[-0.03em]">{section.title}</h2>
            <div className="mt-5 space-y-5 text-[16px] leading-[1.7] text-[#777]">
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {section.links && (
              <ul className="mt-5 space-y-3 text-sm">
                {section.links.map((link) => <li key={link.href}><Link className="focus-ring underline underline-offset-4" href={link.href}>{link.label}</Link></li>)}
              </ul>
            )}
          </section>
        ))}
        {policy.path === "/privacy" && <div className="mt-10"><AnalyticsPreferences /></div>}
        <p className="mt-12 border-t border-black/10 pt-8 text-[16px] leading-relaxed">
          Contact: <a className="focus-ring break-all underline underline-offset-4" href={`mailto:${SITE_EMAIL.toLowerCase()}`}>{SITE_EMAIL.toLowerCase()}</a>
        </p>
      </article>
    </main>
  );
}
