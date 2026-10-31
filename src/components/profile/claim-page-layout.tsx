import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { SiteNavbar } from "@/components/site-navbar";

export function ClaimPageLayout({ children, title, description, backHref, backLabel, editorial = false }: {
  children: ReactNode; title: string; description: string; backHref: string; backLabel: string; editorial?: boolean;
}) {
  return <main className="min-h-screen bg-white text-[#262626]">
    <a href="#claim-content" className="focus-ring sr-only z-50 bg-white px-4 py-3 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Skip to page content</a>
    <SiteNavbar page="profile" />
    <div id="claim-content" tabIndex={-1} className={editorial
      ? "mx-auto w-full max-w-[1705px] px-4 pb-20 pt-8 sm:px-5 sm:pb-28 sm:pt-12 xl:px-6 xl:pt-16 min-[1700px]:px-11"
      : "mx-auto w-full max-w-[600px] px-5 pb-12 pt-5 sm:pt-8"}>
      <Link href={backHref as Route} className={`focus-ring inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#767676] transition-colors hover:text-[#262626] ${editorial ? "mb-7 sm:mb-10" : "mb-5"}`}>
        <ArrowLeft size={15} aria-hidden="true" />{backLabel}
      </Link>
      <header className={editorial ? "max-w-[980px]" : "mb-5"}>
        <h1 className={editorial
          ? "max-w-[850px] text-balance text-[32px] font-normal leading-[1.08] tracking-[-0.04em] sm:text-[40px]"
          : "text-balance text-[28px] font-medium leading-tight tracking-[-0.6px] sm:text-[32px]"}>{title}</h1>
        <p className={editorial
          ? "mt-5 max-w-[680px] text-[18px] leading-[1.45] tracking-[-0.02em] text-[#777] sm:mt-6 sm:text-[20px]"
          : "mt-3 max-w-[48ch] text-sm leading-6 text-[#767676]"}>{description}</p>
      </header>
      {editorial ? <div className="mt-10 border-t border-black/10 pt-8 sm:mt-14 lg:pt-10">{children}</div> : children}
    </div>
  </main>;
}
