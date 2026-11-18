import { getDesignCategories } from "@/data/categories-repository";
import { notFound } from "next/navigation";

import { PostEditor } from "@/components/admin/post-editor";
import { updatePostAction } from "@/features/admin/actions";
import {
  getAdminPostById,
} from "@/features/admin/posts-repository";
import { getAdminCreatorOptions } from "@/features/creators/identity";
import { editorialNoteStatus } from "@/features/admin/editorial-review";

type EditPostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; notes?: string }>;
};

export default async function EditPostPage({ params, searchParams }: EditPostPageProps) {
  const [{ id }, { saved, notes }] = await Promise.all([params, searchParams]);
  const [post, creators, categories] = await Promise.all([
    getAdminPostById(id),
    getAdminCreatorOptions(),
    getDesignCategories(),
  ]);

  if (!post) notFound();
  const editorialEnabled = process.env.EDITORIAL_GENERATION_ENABLED === "true";
  const editorialStatus = editorialEnabled ? await editorialNoteStatus("design", post.id, post) : undefined;

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Posts</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Edit post</h1>
        </div>
        {saved ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {notes === "stale" ? "Saved. Search notes are out of date." : "Changes saved."}
          </p>
        ) : null}
      </div>
      <PostEditor
        editorialEnabled={editorialEnabled}
        editorialStatus={editorialStatus}
        action={updatePostAction.bind(null, post.id)}
        post={post}
        creators={creators}
        categories={categories}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
