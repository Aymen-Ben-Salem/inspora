import { SponsorEditor } from "@/components/admin/sponsor-editor";
import { deleteSponsorAction, saveSponsorAction } from "@/features/admin/actions";
import { getAdminSponsor } from "@/features/admin/sponsor-repository";

type AdminSponsorPageProps = {
  searchParams: Promise<{ saved?: string | string[] }>;
};

export default async function AdminSponsorPage({ searchParams }: AdminSponsorPageProps) {
  const { saved } = await searchParams;
  const sponsor = await getAdminSponsor();

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Manual sponsor
          </h1>
          <p className="mt-2 text-sm text-[#777]">
            Add a sponsor directly, without checkout. Preview its navbar, feed and sidebar placements before saving.
          </p>
        </div>
      </header>

      {saved === "true" ? (
        <div className="rounded-xl border border-[#315f37]/20 bg-[#dcebdd] p-4 text-sm text-[#315f37]">
          Sponsor changes saved.
        </div>
      ) : saved === "deleted" ? (
        <div className="rounded-xl border border-black/10 bg-[#f5f5f2] p-4 text-sm text-[#666]">
          Sponsor has been removed.
        </div>
      ) : null}

      <SponsorEditor
        key={sponsor?.id ?? "new-sponsor"}
        action={saveSponsorAction}
        sponsor={sponsor}
        deleteAction={deleteSponsorAction}
      />
    </div>
  );
}
