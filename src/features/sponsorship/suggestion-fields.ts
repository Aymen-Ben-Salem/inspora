import type { MetadataSuggestions } from "./types";
export function fillEmptySponsorFields<
  T extends {
    title: string;
    iconId: string;
    wordmarkId: string;
    mediaId: string;
  },
>(fields: T, suggestions: MetadataSuggestions): T {
  return {
    ...fields,
    title: fields.title || suggestions.title || "",
    iconId: fields.iconId || suggestions.iconId || "",
    wordmarkId: fields.wordmarkId || suggestions.wordmarkId || "",
    mediaId: fields.mediaId || suggestions.mediaId || "",
  };
}
