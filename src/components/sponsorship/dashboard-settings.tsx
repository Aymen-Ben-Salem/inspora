"use client";
import type { ReactNode } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardNavigation } from "./dashboard-navigation";
import { SponsorSecurity } from "./sponsor-security";
import { SponsorOwnerBoundary } from "./sponsor-owner-boundary";
import { hasSponsorSecondFactor } from "@/features/sponsorship/security-state";
import styles from "./dashboard.module.css";

export function SponsorDashboardBoundary({ ownerUserId, children }: { ownerUserId: string; children: ReactNode }) {
  const params = useSearchParams();
  const settings = <DashboardSettings />;
  return <SponsorOwnerBoundary ownerUserId={ownerUserId}
    securityView={params.get("section") === "settings" ? settings : undefined}
    securityFallback={settings}>{children}</SponsorOwnerBoundary>;
}

/** Security-only content: remains mounted as enrollment changes the factor state. */
function DashboardSettings() {
  const router = useRouter();
  const { sessionClaims } = useAuth();
  const { user } = useUser();
  const locked = Boolean(user?.totpEnabled && !hasSponsorSecondFactor(sessionClaims?.fva));
  const changeSection = (section: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url);
  };
  return <main className={`${styles.shell} archive-frame grid min-h-[80dvh] items-start gap-6 pb-16 pt-8 lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-8`}>
    <aside className="min-w-0 lg:min-h-[calc(100dvh-140px)] lg:border-r lg:border-[#f0f0f0] lg:pr-5">
      <DashboardNavigation section="settings" locked={locked} onChange={changeSection} />
    </aside>
    <section id="settings" aria-label="Settings" className="min-w-0">
      <h1 className={styles.heading}>Settings</h1>
      <p className={`mb-6 mt-3 text-sm leading-6 ${styles.muted}`}>{locked ? "Verify this sign-in to return to your other dashboard sections." : "Manage your account security and sign-in preferences."}</p>
      <SponsorSecurity embedded onReady={() => router.refresh()} />
    </section>
  </main>;
}
