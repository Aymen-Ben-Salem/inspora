import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNavbar } from "@/components/site-navbar";
import { CreatorClaimsPanel } from "@/components/profile/creator-claims-panel";
import { getOwnCreatorClaims } from "@/features/creators/identity/claim-requests";
import { parseAdminPage } from "@/features/admin/library-pagination";

export const metadata: Metadata = { title: "Your creator claims", robots: { index: false, follow: false } };

export default async function OwnClaimsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fprofile%2Fclaims" as Route);
  const page = parseAdminPage((await searchParams).page);
  const claims = await getOwnCreatorClaims(userId, { page });
  return <main className="min-h-screen bg-[#fafafa]"><SiteNavbar page="profile" /><div className="mx-auto grid max-w-3xl gap-6 px-5 py-12">
    <Link href="/profile" className="focus-ring w-fit cursor-pointer text-sm underline">Back to your profile</Link>
    <CreatorClaimsPanel claims={claims.items} history />
    <nav aria-label="Claims pages" className="flex items-center gap-4 text-sm">
      {page > 1 ? <Link className="focus-ring cursor-pointer rounded-full bg-[#262626] px-4 py-2 text-white" href={("/profile/claims?page=" + (page - 1)) as Route}>Previous</Link> : null}<span>Page {page}</span>
      {claims.hasNext ? <Link className="focus-ring cursor-pointer rounded-full bg-[#262626] px-4 py-2 text-white" href={("/profile/claims?page=" + (page + 1)) as Route}>Next</Link> : null}
    </nav>
  </div></main>;
}
