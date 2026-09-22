import { z } from "zod";
import { SAVED_CATEGORIES, type SavedCategory } from "@/domain/saved-post";

const cursorSchema = z.strictObject({
  v: z.literal(1),
  scope: z.strictObject({ kind: z.literal("saved"), userId: z.string().min(1) }),
  filters: z.strictObject({ category: z.enum(SAVED_CATEGORIES).nullable() }),
  order: z.literal("saved-desc"),
  keys: z.strictObject({
    savedAt: z.iso.datetime(),
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  }),
});
export type SavedCursorKeys = z.infer<typeof cursorSchema>["keys"];
export type SavedCursorBinding = { userId: string; category?: SavedCategory };

export function encodeSavedCursor(keys: SavedCursorKeys, binding: SavedCursorBinding) {
  return Buffer.from(JSON.stringify({
    v: 1, scope: { kind: "saved", userId: binding.userId },
    filters: { category: binding.category ?? null }, order: "saved-desc", keys,
  }), "utf8").toString("base64url");
}

export function decodeSavedCursor(value: string, binding: SavedCursorBinding): SavedCursorKeys | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.scope.userId !== binding.userId ||
      parsed.data.filters.category !== (binding.category ?? null)) return null;
    return parsed.data.keys;
  } catch {
    return null;
  }
}
