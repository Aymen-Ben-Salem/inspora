import type { MediaUploadOperations } from "@/features/media/prepare-upload";
import type {
  SponsorAssetKind,
  VerifiedSponsorAsset,
} from "@/features/sponsorship/types";
export type SponsorUploadedBundle = {
  primary: VerifiedSponsorAsset;
  poster?: VerifiedSponsorAsset;
  videoPreview?: VerifiedSponsorAsset;
  variants: VerifiedSponsorAsset[];
};
export async function sponsorRequest<T>(
  path: string,
  method: string,
  input?: unknown,
): Promise<T> {
  const response = await fetch(`/api/sponsorship/${path}`, {
    method,
    cache: "no-store",
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  });
  const result = await response.json();
  if (!response.ok || result.ok === false)
    throw new Error(result.message || "Sponsor preparation is unavailable.");
  return result.value ?? result;
}
export function sponsorUploadOperations(
  kind: "media" | "icon" | "wordmark" | "poster",
): MediaUploadOperations<SponsorUploadedBundle> {
  return {
    converterConfiguration: () => sponsorRequest("converter", "GET"),
    async upload(bundle, onStatus) {
      const completed: VerifiedSponsorAsset[] = [];
      for (const output of bundle.outputs) {
        const role: SponsorAssetKind =
          output.role === "primary"
            ? kind
            : output.role === "variant"
              ? "variant"
              : output.role === "poster"
                ? "poster"
                : "video-preview";
        onStatus("signing");
        const ticket = await sponsorRequest<{
          id: string;
          uploadUrl: string;
          method: string;
          headers: Record<string, string>;
        }>("uploads", "POST", {
          kind: role,
          contentType: output.file.type,
          sizeBytes: output.file.size,
        });
        onStatus("uploading");
        const response = await fetch(ticket.uploadUrl, {
          method: ticket.method,
          headers: ticket.headers,
          body: output.file,
        });
        if (!response.ok)
          throw new Error("The storage service rejected the upload.");
        onStatus("verifying");
        completed.push(
          await sponsorRequest<VerifiedSponsorAsset>("uploads", "PUT", {
            id: ticket.id,
          }),
        );
      }
      const at = (role: string) =>
        completed[bundle.outputs.findIndex((o) => o.role === role)];
      return {
        primary: at("primary"),
        poster: at("poster"),
        videoPreview: at("video-preview"),
        variants: completed.filter(
          (_, i) => bundle.outputs[i].role === "variant",
        ),
      };
    },
  };
}
