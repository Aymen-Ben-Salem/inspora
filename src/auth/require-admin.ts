import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getConfiguredAdminUserIds, isClerkConfigured } from "./config";

export class AdminAuthConfigurationError extends Error {
  constructor() {
    super("Clerk authentication or the admin allowlist is not configured.");
    this.name = "AdminAuthConfigurationError";
  }
}

export async function requireAdmin() {
  const adminUserIds = getConfiguredAdminUserIds();

  if (!isClerkConfigured() || adminUserIds.size === 0) {
    throw new AdminAuthConfigurationError();
  }

  const { userId } = await auth();

  if (!userId) redirect("/admin" as Route);
  if (!adminUserIds.has(userId)) redirect("/admin-access-denied" as Route);

  return { userId };
}
