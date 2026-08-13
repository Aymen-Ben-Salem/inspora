import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import { PostDetail } from "@/components/post-detail";
import {
  getAdjacentPosts,
  getPostBySlug,
  getPublishedSlugs,
  PUBLISHED_POSTS_CACHE_TAG,
} from "@/data/posts-repository";

type PostModalPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function PostModalPage({ params }: PostModalPageProps) {
  "use cache";

  cacheLife({
    stale: 300,
    revalidate: 21_600,
    expire: 604_800,
  });
  cacheTag(PUBLISHED_POSTS_CACHE_TAG);

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
