import { notFound } from "next/navigation";

import { PostEditor } from "@/components/admin/post-editor";
import { updatePostAction } from "@/features/admin/actions";
import {
  getAdminCreators,
  getAdminPostById,
} from "@/features/admin/posts-repository";

type EditPostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function EditPostPage({ params, searchParams }: EditPostPageProps) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [post, creators] = await Promise.all([
    getAdminPostById(id),
    getAdminCreators(),
  ]);

  if (!post) notFound();

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Posts</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Edit post</h1>
        </div>
        {saved ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            Changes saved.
          </p>
        ) : null}
      </div>
      <PostEditor
        action={updatePostAction.bind(null, post.id)}
        post={post}
        creators={creators}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
