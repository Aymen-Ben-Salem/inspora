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
  serializeJsonLd,
  SITE_NAME,
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

  const cover = post.media[0];

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
      images: cover ? [{ url: cover.url, width: cover.width, height: cover.height, alt: cover.alt }] : [],
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: post.title,
      description: post.description,
      images: cover ? [cover.url] : [],
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
