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
