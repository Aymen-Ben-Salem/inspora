import Link from "next/link";

import { requireAdmin } from "@/auth/require-admin";
import { EmailSubscribers } from "@/components/admin/email-subscribers";
import { MembersView } from "@/components/admin/members-view";
import { firstParam, type MemberSearchParams } from "@/features/admin/members-data";
import { getAdminMembers } from "@/features/admin/members-repository";

export default async function MembersPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  await requireAdmin();
  const raw = await searchParams;
  const emailView = firstParam(raw.view) === "email";
  const tabClass = "focus-ring rounded-full px-4 py-2 text-sm transition-colors";

  return (
    <div className="grid gap-7">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.05em]">Members</h1>
          <p className="mt-2 text-sm text-[#666]">People with an Inspora account.</p>
        </div>
        <nav aria-label="Members and subscribers" className="flex max-w-full gap-1 rounded-full border border-black/10 p-1">
          <Link prefetch={false} href="/admin/subscribers" aria-current={!emailView ? "page" : undefined} className={`${tabClass} ${!emailView ? "bg-white text-black" : "text-[#666] hover:text-black"}`}>Members</Link>
          <Link prefetch={false} href="/admin/subscribers?view=email" aria-current={emailView ? "page" : undefined} className={`${tabClass} ${emailView ? "bg-white text-black" : "text-[#666] hover:text-black"}`}>Email subscribers</Link>
        </nav>
      </header>
      {emailView ? <EmailSubscribers searchParams={Promise.resolve(raw)} /> : <MembersView result={await getAdminMembers(raw)} />}
    </div>
  );
}
