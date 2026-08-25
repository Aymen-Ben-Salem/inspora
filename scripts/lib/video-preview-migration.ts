import type { VideoPreview } from "../../src/storage/types";

export type VideoPreviewCandidate = {
  id: string;
  resourceType: "post_media" | "sponsor";
  sourceStorageKey: string;
  sourceUrl: string;
  preview: VideoPreview | null;
};

export type RunnableVideoPreviewCandidate = VideoPreviewCandidate & {
  sourceKind: "development-r2" | "public-url";
};

export function selectPendingVideoPreviews(
  candidates: VideoPreviewCandidate[],
  limit?: number,
) {
  const pending = candidates.filter((candidate) => !candidate.preview);
  return limit ? pending.slice(0, limit) : pending;
}

export function partitionVideoPreviewsBySource(
  candidates: VideoPreviewCandidate[],
  availableStorageKeys: ReadonlySet<string>,
  allowedPublicSourceHosts: ReadonlySet<string>,
  limit?: number,
) {
  const available: RunnableVideoPreviewCandidate[] = [];
  const missing: VideoPreviewCandidate[] = [];

  for (const candidate of selectPendingVideoPreviews(candidates)) {
    if (availableStorageKeys.has(candidate.sourceStorageKey)) {
      available.push({ ...candidate, sourceKind: "development-r2" });
      continue;
    }

    try {
      const sourceUrl = new URL(candidate.sourceUrl);
      if (
        sourceUrl.protocol === "https:" &&
        allowedPublicSourceHosts.has(sourceUrl.hostname)
      ) {
        available.push({ ...candidate, sourceKind: "public-url" });
        continue;
      }
    } catch {
      // Invalid and untrusted URLs are reported as missing below.
    }

    missing.push(candidate);
  }

  return {
    available: limit ? available.slice(0, limit) : available,
    missing,
  };
}

export function buildDevelopmentPreviewStorageKey(
  candidate: VideoPreviewCandidate,
) {
  const prefix = candidate.resourceType === "post_media" ? "posts" : "sponsors";
  return `${prefix}/previews/${candidate.id}.mp4`;
}
