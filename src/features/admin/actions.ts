"use server";

import type { Route } from "next";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/auth/require-admin";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";

import { formatValidationError, parseAdminPostForm } from "./post-validation";
import {
  archiveAdminPost,
  createAdminPost,
  deleteArchivedPost,
  setAdminPostFeatured,
  updateAdminPost,
} from "./posts-repository";
import {
  deleteAdminSponsor,
  saveAdminSponsor,
  setAdminSponsorActive,
} from "./sponsor-repository";
import { parseAdminSponsorForm } from "./sponsor-validation";
import { deleteSubscriber, unsubscribeSubscriber } from "./subscribers-repository";
import type { AdminActionState } from "./types";

const idSchema = z.uuid();

function isUniqueViolation(error: unknown): boolean {
  let current = error;

  while (current instanceof Error) {
    if ("code" in current && current.code === "23505") return true;
    current = current.cause;
  }

  return false;
}

function postErrorState(error: unknown): AdminActionState {
  if (error instanceof z.ZodError) {
    return { status: "error", message: formatValidationError(error) };
  }

  if (isUniqueViolation(error)) {
    return { status: "error", message: "That slug is already used by another post." };
  }

  console.error("Admin post mutation failed", error);
  return { status: "error", message: "The post could not be saved. Try again." };
}

function revalidatePostPaths(slug: string, previousSlug?: string) {
  updateTag(PUBLISHED_POSTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/posts");
  revalidatePath(`/posts/${slug}` as Route);
  if (previousSlug && previousSlug !== slug) {
    revalidatePath(`/posts/${previousSlug}` as Route);
  }
}

export async function createPostAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { userId } = await requireAdmin();
  let created: Awaited<ReturnType<typeof createAdminPost>>;

  try {
    created = await createAdminPost(parseAdminPostForm(formData), userId);
  } catch (error) {
    return postErrorState(error);
  }

  await deleteManagedMediaAssetsSafely(created.removedManagedMedia);

  revalidatePostPaths(created.slug);
  redirect(`/admin/posts/${created.id}/edit?saved=created` as Route);
}

export async function updatePostAction(
  id: string,
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { userId } = await requireAdmin();
  let postId: string;
  let updated: Awaited<ReturnType<typeof updateAdminPost>>;

  try {
    postId = idSchema.parse(id);
    updated = await updateAdminPost(postId, parseAdminPostForm(formData), userId);
  } catch (error) {
    return postErrorState(error);
  }

  await deleteManagedMediaAssetsSafely(updated.removedManagedMedia);

  revalidatePostPaths(updated.slug, updated.previousSlug);
  redirect(`/admin/posts/${postId}/edit?saved=updated` as Route);
}

export async function archivePostAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const archived = await archiveAdminPost(id, userId);

  revalidatePostPaths(archived.slug);
  redirect("/admin/posts" as Route);
}

export async function setPostFeaturedAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const isFeatured = z.enum(["true", "false"]).parse(formData.get("isFeatured")) === "true";
  const post = await setAdminPostFeatured(id, isFeatured, userId);

  revalidatePostPaths(post.slug);
}

export async function deletePostAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const deleted = await deleteArchivedPost(id, userId);

  await deleteManagedMediaAssetsSafely(deleted.removedManagedMedia);

  revalidatePostPaths(deleted.slug);
  redirect("/admin/posts" as Route);
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));

  await unsubscribeSubscriber(id, userId);
  revalidatePath("/admin/subscribers");
}

export async function deleteSubscriberAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));

  await deleteSubscriber(id, userId);
  revalidatePath("/admin/subscribers");
}

function revalidateSponsorPaths() {
  updateTag(SPONSOR_CACHE_TAG);
  updateTag(PUBLISHED_POSTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/sponsor");
  revalidatePath("/admin/posts");
}

export async function saveSponsorAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { userId } = await requireAdmin();
  let saved: Awaited<ReturnType<typeof saveAdminSponsor>>;

  try {
    const input = parseAdminSponsorForm(formData);
    saved = await saveAdminSponsor(input, userId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "error", message: formatValidationError(error) };
    }
    console.error("Admin sponsor save failed", error);
    return { status: "error", message: "The sponsor could not be saved. Try again." };
  }

  await deleteManagedMediaAssetsSafely(saved.removedManagedMedia);
  revalidateSponsorPaths();
  redirect("/admin/sponsor?saved=true" as Route);
}

export async function toggleSponsorActiveAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const isActive = z.enum(["true", "false"]).parse(formData.get("isActive")) === "true";
  await setAdminSponsorActive(isActive, userId);
  revalidateSponsorPaths();
}

export async function deleteSponsorAction() {
  const { userId } = await requireAdmin();
  const removedManagedMedia = await deleteAdminSponsor(userId);
  await deleteManagedMediaAssetsSafely(removedManagedMedia);
  revalidateSponsorPaths();
  redirect("/admin/sponsor?saved=deleted" as Route);
}

