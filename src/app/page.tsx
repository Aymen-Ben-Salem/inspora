import type { Metadata } from "next";

import { ArchiveView } from "@/components/archive-view";
import { getPostPage } from "@/data/posts-repository";
import { getActiveSponsor } from "@/data/sponsor-repository";
import { isPostCategory, isPostView } from "@/domain/post";

type HomeProps = {
  searchParams: Promise<{
    category?: string | string[];
    view?: string | string[];
  }>;
};

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const params = await searchParams;
  const isFiltered = Boolean(params.category || params.view);

  return {
    alternates: { canonical: "/" },
    robots: isFiltered
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: { url: "/" },
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const { category: categoryParam, view: viewParam } = await searchParams;
  const rawCategory = Array.isArray(categoryParam) ? categoryParam[0] : categoryParam;
  const category = rawCategory && isPostCategory(rawCategory) ? rawCategory : undefined;
  const rawView = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const view = rawView && isPostView(rawView) ? rawView : "latest";

  const [page, sponsor] = await Promise.all([
    getPostPage({ category, view }),
    getActiveSponsor(),
  ]);

  return (
    <ArchiveView
      page={page}
      category={category}
      view={view}
      sponsor={sponsor}
    />
  );
}
