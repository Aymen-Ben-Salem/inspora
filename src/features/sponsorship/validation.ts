import { z } from "zod";
export const destinationSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP(S) website URL without credentials.");
export const campaignInputSchema = z
  .object({
    title: z.string().trim().min(1, "Public name is required.").max(160),
    url: destinationSchema,
    tagline: z.string().trim().max(300).default(""),
    expectedRevision: z.number().int().nonnegative(),
    iconId: z.uuid({ error: "Upload a compact icon before saving." }),
    wordmarkId: z.uuid({ error: "Upload a full wordmark before saving." }),
    mediaId: z.uuid().optional(),
    posterId: z.uuid().optional(),
    videoPreviewId: z.uuid().optional(),
    variantIds: z.array(z.uuid()).max(4).default([]),
  })
  .strict();
