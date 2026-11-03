export type DraftSuggestionRole = "icon" | "wordmark" | "media";
export type DraftWebsiteSuggestions = {
  title?: string;
  feedDescription?: string;
  files: { kind: DraftSuggestionRole; contentType: string; base64: string }[];
  missingAssets: string[];
};
