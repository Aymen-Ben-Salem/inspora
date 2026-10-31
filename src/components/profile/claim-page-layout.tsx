import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { SiteNavbar } from "@/components/site-navbar";

export function ClaimPageLayout({ children, title, description, backHref, backLabel }: {
  children: ReactNode; title: string; description: string; backHref: string; backLabel: string;
}) {
  return <main className="min-h-screen bg-white text-[#262626]">
    <a href="#claim-content" className="focus-ring sr-only z-50 bg-white px-4 py-3 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Skip to page content</a>
    <SiteNavbar page="profile" />
    <div id="claim-content" tabIndex={-1} className="mx-auto w-full max-w-[600px] px-5 pb-12 pt-5 sm:pt-8">
      <Link href={backHref as Route} className="focus-ring mb-5 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-[#767676] transition-colors hover:text-[#262626]">
        <ArrowLeft size={15} aria-hidden="true" />{backLabel}
      </Link>
      <header className="mb-5">
        <h1 className="text-balance text-[28px] font-medium leading-tight tracking-[-0.6px] sm:text-[32px]">{title}</h1>
        <p className="mt-3 max-w-[48ch] text-sm leading-6 text-[#767676]">{description}</p>
      </header>
      {children}
    </div>
  </main>;
}
