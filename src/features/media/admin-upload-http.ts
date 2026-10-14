import type { MediaUploadCompletionResult, MediaUploadSignatureResult } from "../admin/media-upload";

async function requestUpload<T>(operation: string, input?: unknown): Promise<T> {
  const response = await fetch("/api/admin/media", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, input }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    throw new Error(
      result?.message ?? (response.status === 401
        ? "Please sign in as an administrator and retry the upload."
        : "The upload request failed. Please retry."),
    );
  }
  return result as T;
}

export const adminUploadHttpRequests = {
  sign: (input: unknown) => requestUpload<MediaUploadSignatureResult>("sign", input),
  complete: (input: unknown) => requestUpload<MediaUploadCompletionResult>("complete", input),
  discard: (input: { kind: string; storageKeys: string[] }) => requestUpload("discard", input),
  converterConfiguration: () => requestUpload<{ coreUrl: string; wasmUrl: string }>("converter"),
};
