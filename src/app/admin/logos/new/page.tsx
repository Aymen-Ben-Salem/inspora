import { LogoEditor } from "@/components/admin/logo-editor";
import { createLogoAction } from "@/features/admin/actions";
import { getAdminCreators } from "@/features/admin/posts-repository";

export default async function NewLogoPage() {
  const creators = await getAdminCreators();

  return (
    <div className="grid gap-7">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Logos</p>
        <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">New logo</h1>
      </div>
      <LogoEditor action={createLogoAction} creators={creators} />
    </div>
  );
}
