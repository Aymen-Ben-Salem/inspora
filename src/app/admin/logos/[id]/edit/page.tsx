import { notFound } from "next/navigation";

import { LogoEditor } from "@/components/admin/logo-editor";
import { updateLogoAction } from "@/features/admin/actions";
import { getAdminLogoById } from "@/features/admin/logos-repository";
import { getAdminCreatorOptions } from "@/features/creators/identity";
import { editorialNoteStatus } from "@/features/admin/editorial-review";

type EditLogoPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; notes?: string }>;
};

export default async function EditLogoPage({ params, searchParams }: EditLogoPageProps) {
  const [{ id }, { saved, notes }] = await Promise.all([params, searchParams]);
  const [logo, creators] = await Promise.all([
    getAdminLogoById(id),
    getAdminCreatorOptions(),
  ]);

  if (!logo) notFound();
  const editorialEnabled = process.env.EDITORIAL_GENERATION_ENABLED === "true";
  const editorialStatus = editorialEnabled ? await editorialNoteStatus(logo.kind, logo.id, logo) : undefined;

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Logos</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Edit logo</h1>
        </div>
        {saved ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {notes === "stale" ? "Saved. Search notes are out of date." : "Changes saved."}
          </p>
        ) : null}
      </div>
      <LogoEditor
        editorialEnabled={editorialEnabled}
        editorialStatus={editorialStatus}
        action={updateLogoAction.bind(null, logo.id)}
        logo={logo}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
