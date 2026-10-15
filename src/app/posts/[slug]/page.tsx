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
import {
  buildPostStructuredData,
  getPostCoverImage,
  serializeJsonLd,
  SITE_NAME,
  SITE_OG_IMAGE,
} from "@/lib/seo";

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

  const cover = getPostCoverImage(post.media[0]) ?? { url: SITE_OG_IMAGE };

  return {
    title: post.title,
    description: post.description,
    keywords: [post.category, ...post.industries, ...post.styles],
    authors: [{ name: post.creator.name, url: post.creator.url }],
    alternates: { canonical: `/posts/${post.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url: `/posts/${post.slug}`,
      siteName: SITE_NAME,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      authors: [post.creator.name],
      images: [cover],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [cover.url],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildPostStructuredData(post)),
        }}
      />
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
