import { WebsiteEditor } from "@/components/admin/website-editor";
import { createWebsiteAction } from "@/features/admin/actions";
import { getAdminCreators } from "@/features/admin/posts-repository";

export default async function NewWebsitePage() {
  const creators = await getAdminCreators();
  return (
    <div className="grid gap-7">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Websites</p>
        <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">New website</h1>
      </div>
      <WebsiteEditor
        action={createWebsiteAction}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
