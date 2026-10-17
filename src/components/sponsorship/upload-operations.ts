import type { MediaUploadOperations } from "@/features/media/prepare-upload";
import type {
  SponsorAssetKind,
  VerifiedSponsorAsset,
} from "@/features/sponsorship/types";
export type SponsorUploadedBundle = {
  original: VerifiedSponsorAsset;
  primary: VerifiedSponsorAsset;
  poster?: VerifiedSponsorAsset;
  videoPreview?: VerifiedSponsorAsset;
  variants: VerifiedSponsorAsset[];
};
export async function sponsorRequest<T>(
  path: string,
  method: string,
  input?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const response = await fetch(`/api/sponsorship/${path}`, {
    method,
    cache: "no-store",
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
    signal,
  });
  const result = await response.json().catch(() => null);
  signal?.throwIfAborted();
  if (response.headers?.get("x-vercel-mitigated") === "challenge")
    throw new Error(
      "A security check interrupted the request. Open this site in another tab to complete the check, then try again.",
    );
  if (!response.ok || !result || typeof result !== "object" || result.ok === false)
    throw new Error(
      typeof result?.message === "string" && result.message
        ? result.message
        : path === "metadata"
          ? "Suggestions are unavailable. Continue with manual fields and uploads."
          : "Sponsor preparation is unavailable.",
    );
  return result.value ?? result;
}
export function sponsorUploadOperations(
  kind: "media" | "icon" | "wordmark" | "poster",
  signal?: AbortSignal,
): MediaUploadOperations<SponsorUploadedBundle> {
  return {
    converterConfiguration: () =>
      sponsorRequest("converter", "GET", undefined, signal),
    async upload(bundle, onStatus) {
      async function transfer(
        file: File,
        role: SponsorAssetKind,
        sourceAssetId?: string,
      ) {
        signal?.throwIfAborted();
        onStatus("signing");
        const ticket = await sponsorRequest<{
          id: string;
          uploadUrl: string;
          method: string;
          headers: Record<string, string>;
        }>(
          "uploads",
          "POST",
          {
            kind: role,
            contentType: file.type,
            sizeBytes: file.size,
            ...(sourceAssetId ? { sourceAssetId } : {}),
          },
          signal,
        );
        onStatus("uploading");
        const response = await fetch(ticket.uploadUrl, {
          method: ticket.method,
          headers: ticket.headers,
          body: file,
          signal,
        });
        if (!response.ok)
          throw new Error("The storage service rejected the upload.");
        onStatus("verifying");
        return sponsorRequest<VerifiedSponsorAsset>(
          "uploads",
          "PUT",
          {
            id: ticket.id,
          },
          signal,
        );
      }
      const original = await transfer(bundle.source.file, "original");
      const completed: VerifiedSponsorAsset[] = [];
      for (const output of bundle.outputs)
        completed.push(
          await transfer(
            output.file,
            output.role === "primary" ? kind : output.role,
            original.id,
          ),
        );
      const at = (role: string) =>
        completed[bundle.outputs.findIndex((o) => o.role === role)];
      return {
        original,
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
