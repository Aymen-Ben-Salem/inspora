import { POST_CATEGORIES, isPostCategory, type PostCategory } from "./post";

export const SAVED_CATEGORIES = [...POST_CATEGORIES, "Logos", "Websites"] as const;
export type SavedCategory = PostCategory | "Logos" | "Websites";
export function isSavedCategory(value: string): value is SavedCategory {
  return isPostCategory(value) || value === "Logos" || value === "Websites";
}
