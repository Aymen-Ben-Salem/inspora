import "server-only";

import { ensureCreatorForOwner } from "./identity";

// Existing batch compatibility for logo/website callers until ticket 07.
export { resolveCreatorMutation } from "./identity/admin";

export async function ensureOwnedCreator(userId: string) {
  return ensureCreatorForOwner({ userId });
}
