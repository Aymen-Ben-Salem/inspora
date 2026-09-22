import { z } from "zod";
import type { PostCategory, PostView } from "@/domain/post";

const cursorSchema = z.strictObject({
  v: z.literal(1),
  scope: z.strictObject({ kind: z.literal("design-archive") }),
  filters: z.strictObject({
    category: z.string().nullable(),
    view: z.enum(["latest", "featured"]),
  }),
  order: z.literal("created-desc"),
  keys: z.strictObject({
    createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    id: z.string().min(1).max(128),
  }),
});

export type DesignArchiveCursorKeys = z.infer<typeof cursorSchema>["keys"];

type DesignArchiveCursorBinding = {
  category?: PostCategory;
  view?: PostView;
};

function filtersFor(binding: DesignArchiveCursorBinding) {
  return {
    category: binding.category ?? null,
    view: binding.view ?? "latest",
  } as const;
}

export function encodeDesignArchiveCursor(
  keys: DesignArchiveCursorKeys,
  binding: DesignArchiveCursorBinding,
) {
  return Buffer.from(JSON.stringify({
    v: 1,
    scope: { kind: "design-archive" },
    filters: filtersFor(binding),
    order: "created-desc",
    keys,
  }), "utf8").toString("base64url");
}

export function decodeDesignArchiveCursor(
  value: string,
  binding: DesignArchiveCursorBinding,
): DesignArchiveCursorKeys | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = cursorSchema.safeParse(decoded);
    if (!parsed.success) return null;

    const expected = filtersFor(binding);
    if (
      parsed.data.filters.category !== expected.category ||
      parsed.data.filters.view !== expected.view
    ) return null;

    return parsed.data.keys;
  } catch {
    return null;
  }
}

export class InvalidPublicWorkCursorError extends Error {
  constructor() {
    super("Invalid public-work cursor.");
    this.name = "InvalidPublicWorkCursorError";
  }
}

// Persisted design IDs are UUIDs; the development array paginator uses string IDs.
export function decodePersistedDesignArchiveCursor(
  value: string,
  binding: DesignArchiveCursorBinding,
): DesignArchiveCursorKeys | null {
  const keys = decodeDesignArchiveCursor(value, binding);
  return keys && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keys.id)
    ? keys
    : null;
}
