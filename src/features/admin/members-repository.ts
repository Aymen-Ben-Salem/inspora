import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { requireAdmin } from "@/auth/require-admin";

import { createMembersReader } from "./members-service";

export const getAdminMembers = createMembersReader({
  authorize: requireAdmin,
  directory: async () => (await clerkClient()).users,
});
