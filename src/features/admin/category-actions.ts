"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/auth/require-admin";
import { DESIGN_CATEGORIES_CACHE_TAG } from "@/data/categories-repository";
import { withWriteTransaction } from "@/db/write-client";
import { adminAuditLogs, designCategories } from "@/db/schema";
import { isCategoryName, normalizeCategoryName } from "@/domain/category";

export async function createCategoryAction(rawName: string): Promise<
  { status: "success"; name: string } | { status: "error"; message: string }
> {
  const admin = await requireAdmin();
  const name = typeof rawName === "string" ? normalizeCategoryName(rawName) : "";
  if (!isCategoryName(name)) {
    return { status: "error", message: "Use a category name of 1?60 characters. All, Logos, Websites, App-icons and In-review are reserved." };
  }
  try {
    const created = await withWriteTransaction(async (tx) => {
      const rows = await tx.insert(designCategories).values({ name }).onConflictDoNothing().returning();
      if (!rows.length) return false;
      await tx.insert(adminAuditLogs).values({
        actorId: admin.userId, action: "category.created", resourceType: "category",
        details: { name },
      });
      return true;
    });
    if (!created) return { status: "error", message: "A category with that name already exists." };
  } catch (error) {
    console.error("Admin category creation failed", error);
    return { status: "error", message: "The category could not be created. Try again." };
  }
  updateTag(DESIGN_CATEGORIES_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/posts", "layout");
  return { status: "success", name };
}
