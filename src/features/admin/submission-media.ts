import type { AdminSubmissionReview } from "../submissions/review-service";
import type { MediaUploadKind, UploadedAdminMedia } from "./media-upload";

type SubmittedSource = Pick<AdminSubmissionReview, "id" | "kind" | "mediaHref" | "mediaType">;

/** A private editor preview, never a publishable managed asset. */
export function submissionMediaDraft(source: SubmittedSource): UploadedAdminMedia | undefined {
  if (!source.mediaHref || !["design", "logo"].includes(source.kind)) return;
  return {
    type: source.mediaType?.startsWith("video/") ? "video" : "image",
    url: source.mediaHref,
    alt: `Submitted ${source.kind}`,
    // The editor shows "Automatic" until the publication pipeline measures the file.
    width: 1,
    height: 1,
  };
}

/** Called only by the explicit acceptance action, never while viewing a review. */
export async function prepareSubmissionMedia(
  source: SubmittedSource,
  formData: FormData,
  upload: (file: File, kind: MediaUploadKind) => Promise<UploadedAdminMedia>,
  fetchSource: typeof fetch = fetch,
) {
  if (!source.mediaHref || !["design", "logo"].includes(source.kind)) return;
  if (source.mediaHref !== `/api/submissions/${source.id}/media`) {
    throw new Error("The submitted source is invalid. Reload the review.");
  }
  const media = JSON.parse(String(formData.get("media")));
  const items = source.kind === "design" ? media : [media];
  if (!Array.isArray(items)) throw new Error("The media gallery is invalid.");
  if (!items.some((item) => item?.url === source.mediaHref)) return;

  const response = await fetchSource(source.mediaHref, {
    credentials: "same-origin", cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("The submitted file could not be loaded. Reload the review and try again.");
  const blob = await response.blob();
  const extensions: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "image/avif": "avif", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
  };
  const extension = extensions[blob.type];
  if (!extension || blob.type !== source.mediaType) throw new Error("The submitted file type could not be verified.");
  const uploaded = await upload(
    new File([blob], `submitted-${source.kind}.${extension}`, { type: blob.type }),
    source.kind === "design" ? "post-media" : "logo-media",
  );
  const prepared = items.map((item) => item?.url === source.mediaHref
    ? { ...uploaded, alt: item.alt || uploaded.alt }
    : item);
  formData.set("media", JSON.stringify(source.kind === "design" ? prepared : prepared[0]));
}
