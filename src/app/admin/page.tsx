import { auth } from "@clerk/nextjs/server";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getConfiguredAdminUserIds, isAdminAccessConfigured } from "@/auth/config";

export default async function AdminPage() {
  if (!isAdminAccessConfigured()) return null;

  const { userId } = await auth();

  if (!userId || !getConfiguredAdminUserIds().has(userId)) return null;

  redirect("/admin/posts" as Route);
}
