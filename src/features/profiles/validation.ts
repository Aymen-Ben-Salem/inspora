import { z } from "zod";
import { normalizeCreatorUsername, validateCreatorUsername } from "@/features/creators/validation";

export const profileEditSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters.").optional(),
  username: z.string().trim().transform(normalizeCreatorUsername).superRefine((value, ctx) => {
    const result = validateCreatorUsername(value);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
  }).optional(),
  websiteUrl: z.string().trim().nullable().transform((value, ctx) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      url.hash = "";
      return url.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid http or https website URL." });
      return z.NEVER;
    }
  }).optional(),
});
