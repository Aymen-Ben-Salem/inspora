import { notFound } from "next/navigation";

import { LogoEditor } from "@/components/admin/logo-editor";
import { updateLogoAction } from "@/features/admin/actions";
import { getAdminLogoById } from "@/features/admin/logos-repository";
import { getAdminCreators } from "@/features/admin/posts-repository";

type EditLogoPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function EditLogoPage({ params, searchParams }: EditLogoPageProps) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [logo, creators] = await Promise.all([
    getAdminLogoById(id),
    getAdminCreators(),
  ]);

  if (!logo) notFound();

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Logos</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Edit logo</h1>
        </div>
        {saved ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            Changes saved.
          </p>
        ) : null}
      </div>
      <LogoEditor
        action={updateLogoAction.bind(null, logo.id)}
        logo={logo}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
