import { notFound } from "next/navigation";

import { PostDetail } from "@/components/post-detail";
import {
  getAdjacentPosts,
  getPostBySlug,
} from "@/data/posts-repository";

type PostModalPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PostModalPage({ params }: PostModalPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const { previousPost, nextPost } = await getAdjacentPosts(post);

  return (
    <PostDetail
      post={post}
      previousPost={previousPost}
      nextPost={nextPost}
      closeMode="back"
    />
  );
}
