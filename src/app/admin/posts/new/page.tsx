import { PostEditor } from "@/components/admin/post-editor";
import { createPostAction } from "@/features/admin/actions";
import { getAdminCreators } from "@/features/admin/posts-repository";

export default async function NewPostPage() {
  const creators = await getAdminCreators();

  return (
    <div className="grid gap-7">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Posts</p>
        <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">New post</h1>
      </div>
      <PostEditor
        action={createPostAction}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
