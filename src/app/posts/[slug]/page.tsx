import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArchiveView } from "@/components/archive-view";
import { PostDetail } from "@/components/post-detail";
import { PostDialog } from "@/components/post-dialog";
import {
  getAdjacentPosts,
  getPostBySlug,
  getPostPage,
  getPublishedSlugs,
} from "@/data/posts-repository";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) return {};

  const cover = post.media[0];

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      images: cover ? [{ url: cover.url, width: cover.width, height: cover.height, alt: cover.alt }] : [],
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const [page, { previousPost, nextPost }] = await Promise.all([
    getPostPage(),
    getAdjacentPosts(post),
  ]);

  return (
    <>
      <ArchiveView page={page} />
      <PostDialog closeMode="home">
        <PostDetail
          post={post}
          previousPost={previousPost}
          nextPost={nextPost}
          closeMode="home"
        />
      </PostDialog>
    </>
  );
}
