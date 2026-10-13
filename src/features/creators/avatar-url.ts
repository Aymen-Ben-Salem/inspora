import { z } from "zod";

import { isLocalOrHttpsAssetUrl } from "../../lib/asset-url";

export const creatorAvatarUrlSchema = z.string().trim().refine(
  isLocalOrHttpsAssetUrl,
  "Use a local path or an https URL.",
);
