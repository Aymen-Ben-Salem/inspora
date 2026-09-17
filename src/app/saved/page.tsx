import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { isClerkConfigured } from "@/auth/config";
import { SavedPostsView } from "@/components/saved-posts-view";
import {
  getSavedPostCounts,
  getSavedPostPage,
} from "@/data/saved-posts-repository";
import { isSavedCategory } from "@/domain/saved-post";

export const metadata: Metadata = {
  title: "Saved posts",
  robots: { index: false, follow: false },
};

type SavedPageProps = {
  searchParams: Promise<{ category?: string | string[] }>;
};

export default async function SavedPage({ searchParams }: SavedPageProps) {
  if (!isClerkConfigured()) {
    redirect("/sign-in?redirect_url=%2Fsaved" as Route);
  }

  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in?redirect_url=%2Fsaved" as Route);

  const rawCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const category =
    rawCategory && isSavedCategory(rawCategory) ? rawCategory : undefined;
  const [page, counts] = await Promise.all([
    getSavedPostPage({ userId, category }),
    getSavedPostCounts(userId),
  ]);

  return (
    <SavedPostsView
      initialPage={page}
      initialTotal={counts.total}
      initialCounts={counts.categories}
      category={category}
    />
  );
}
