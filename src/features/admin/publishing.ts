import "server-only";

import type { Route } from "next";
import { revalidatePath, updateTag } from "next/cache";

import { PUBLISHED_LOGOS_CACHE_TAG } from "../../data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "../../data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "../../data/websites-repository";
import type { WriteTx } from "../../db/write-client";
import type { PublishedWorkRef } from "../submissions/types";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "../profiles/cache";

import { insertAdminLogoInTransaction } from "./logos-repository";
import { insertAdminPostInTransaction } from "./posts-repository";
import type { AdminLogoInput, AdminPostInput, AdminWebsiteInput } from "./types";
import { insertAdminWebsiteInTransaction } from "./websites-repository";

export type ReviewPublicationInput =
  | { kind: "design"; content: AdminPostInput }
  | { kind: "logo" | "app-icon"; content: AdminLogoInput }
  | { kind: "website"; content: AdminWebsiteInput };

export type PublishReviewedWork = (
  tx: WriteTx,
  input: ReviewPublicationInput,
  actorId: string,
  creatorId: string,
) => Promise<PublishedWorkRef>;

export function enforceReviewedPublication(
  input: ReviewPublicationInput,
): ReviewPublicationInput {
  if (input.kind === "design") {
    return { ...input, content: { ...input.content, status: "published" } };
  }
  if (input.kind === "website") {
    return { ...input, content: { ...input.content, status: "published" } };
  }
  return {
    ...input,
    content: {
      ...input.content,
      kind: input.kind === "app-icon" ? "icon" : "logo",
      status: "published",
    },
  };
}

export const publishReviewedWork: PublishReviewedWork = async (
  tx,
  input,
  actorId,
  creatorId,
) => {
  const reviewed = enforceReviewedPublication(input);
  if (reviewed.kind === "design") {
    const created = await insertAdminPostInTransaction(
      tx,
      reviewed.content,
      actorId,
      creatorId,
    );
    return { kind: "design", id: created.id, href: `/posts/${created.slug}` };
  }
  if (reviewed.kind === "website") {
    const created = await insertAdminWebsiteInTransaction(
      tx,
      reviewed.content,
      actorId,
      creatorId,
    );
    return {
      kind: "website",
      id: created.id,
      href: `/websites?website=${encodeURIComponent(created.slug)}`,
    };
  }
  const created = await insertAdminLogoInTransaction(
    tx,
    reviewed.content,
    actorId,
    creatorId,
  );
  return {
    kind: "logo",
    id: created.id,
    href: `/logos?logo=${encodeURIComponent(created.slug)}`,
  };
};

export function revalidateReviewTransition(
  submissionId: string,
  publishedRef?: PublishedWorkRef,
) {
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${submissionId}` as Route);
  revalidatePath("/profile");

  if (!publishedRef) return;
  updateTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG);
  revalidatePath("/creators/[username]", "page");
  if (publishedRef.kind === "design") {
    updateTag(PUBLISHED_POSTS_CACHE_TAG);
    revalidatePath("/");
    revalidatePath("/admin/posts");
    revalidatePath(publishedRef.href as Route);
    return;
  }
  if (publishedRef.kind === "logo") {
    updateTag(PUBLISHED_LOGOS_CACHE_TAG);
    revalidatePath("/logos");
    revalidatePath("/admin/logos");
    return;
  }
  updateTag(PUBLISHED_WEBSITES_CACHE_TAG);
  revalidatePath("/websites");
  revalidatePath("/admin/websites");
}
