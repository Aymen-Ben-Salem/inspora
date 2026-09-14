import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getConfiguredAdminUserIds, isClerkConfigured } from "@/auth/config";

export const metadata: Metadata = {
  title: "Admin access denied",
  robots: { index: false, follow: false, nocache: true },
};

async function AdminAccessDeniedContent() {
  if (!isClerkConfigured()) redirect("/admin" as Route);

  const { userId } = await auth();

  if (!userId) redirect("/admin" as Route);
  if (getConfiguredAdminUserIds().has(userId)) redirect("/admin" as Route);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f2] px-5 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-black/10 bg-white p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Admin access</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
          This account is not an admin.
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-[#666]">
          You signed in successfully, but this Clerk user ID is not in the server-side admin
          allowlist.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl bg-[#f5f5f2] p-4 font-mono text-xs text-[#444]">
          {userId}
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="focus-ring rounded-full bg-black px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#222]"
          >
            Back to inspiration
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm text-[#666]">
            <span>Change account</span>
            <UserButton />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function AdminAccessDeniedPage() {
  return (
    <Suspense
      fallback={
        <div
          aria-label="Loading authentication"
          className="min-h-[100dvh] bg-[#f5f5f2]"
        />
      }
    >
      <AdminAccessDeniedContent />
    </Suspense>
  );
}
