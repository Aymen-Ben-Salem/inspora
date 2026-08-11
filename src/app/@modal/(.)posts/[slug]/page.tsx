import { notFound } from "next/navigation";

import { PostPageView } from "@/components/post-page-view";
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
    <PostPageView
      post={post}
      previousPost={previousPost}
      nextPost={nextPost}
      closeMode="back"
    />
  );
}
