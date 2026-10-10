import type { MetadataSuggestions } from "./types";
export function fillEmptySponsorFields<
  T extends {
    title: string;
    iconId: string;
    wordmarkId: string;
    mediaId: string;
  },
>(fields: T, suggestions: MetadataSuggestions, replaceAssets = false): T {
  return {
    ...fields,
    title: fields.title || suggestions.title || "",
    iconId:
      (replaceAssets ? suggestions.iconId : fields.iconId) ||
      fields.iconId ||
      suggestions.iconId ||
      "",
    wordmarkId:
      (replaceAssets ? suggestions.wordmarkId : fields.wordmarkId) ||
      fields.wordmarkId ||
      suggestions.wordmarkId ||
      "",
    mediaId:
      (replaceAssets ? suggestions.mediaId : fields.mediaId) ||
      fields.mediaId ||
      suggestions.mediaId ||
      "",
  };
}
