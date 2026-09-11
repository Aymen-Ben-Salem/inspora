import { notFound } from "next/navigation";

import { WebsiteEditor } from "@/components/admin/website-editor";
import { updateWebsiteAction } from "@/features/admin/actions";
import { getAdminCreators } from "@/features/admin/posts-repository";
import { getAdminWebsiteById } from "@/features/admin/websites-repository";

type EditWebsitePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function EditWebsitePage({ params, searchParams }: EditWebsitePageProps) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [website, creators] = await Promise.all([
    getAdminWebsiteById(id),
    getAdminCreators(),
  ]);
  if (!website) notFound();

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Websites</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Edit website</h1>
        </div>
        {saved ? <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">Changes saved.</p> : null}
      </div>
      <WebsiteEditor
        action={updateWebsiteAction.bind(null, website.id)}
        website={website}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
