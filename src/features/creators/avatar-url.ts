import { z } from "zod";

function isAllowedCreatorAvatarUrl(value: string) {
  if (value.startsWith("/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const creatorAvatarUrlSchema = z.string().trim().refine(
  isAllowedCreatorAvatarUrl,
  "Use a local path or an https URL.",
);
