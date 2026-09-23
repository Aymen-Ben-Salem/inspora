import "server-only";

import { ensureCreatorForOwner } from "./identity";

export async function ensureOwnedCreator(userId: string) {
  return ensureCreatorForOwner({ userId });
}
