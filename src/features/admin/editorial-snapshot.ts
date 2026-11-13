import { editorialFields, type EditorialKind, type EditorialValues } from "./editorial-contract";

// Shared by the browser review and server save checks. No database or AI dependencies.
export function editorialSnapshot(kind: EditorialKind, input: Record<string, unknown>) {
  const value = (key: string) => String(input[key] ?? "").trim();
  const current: EditorialValues = {};
  for (const field of editorialFields[kind]) {
    const raw = input[field];
    current[field] = Array.isArray(raw) ? raw.join(", ") : value(field);
    if (!["description", "tagline", "industry", "category"].includes(field)) {
      current[field] = current[field]!.split(",").map((x) => x.trim()).filter(Boolean).join(", ");
    }
  }
  const raw = input.media;
  const media = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((item) => {
    const m = item as Record<string, unknown>;
    return { type: String(m.role ?? m.type ?? "image"), url: String(m.url ?? ""),
      posterUrl: String(m.posterUrl ?? ""), alt: String(m.alt ?? ""),
      width: Number(m.width ?? 0), height: Number(m.height ?? 0) };
  });
  return { kind, title: value("title"), sourceUrl: value("sourceUrl"), current, media };
}

export type EditorialSnapshot = ReturnType<typeof editorialSnapshot>;

export const stableSnapshot = (input: unknown): string => JSON.stringify(input, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export function snapshotFromForm(form: HTMLFormElement, kind: EditorialKind) {
  const data = Object.fromEntries(new FormData(form));
  return editorialSnapshot(kind, { ...data, media: JSON.parse(String(data.media ?? "[]")) });
}
