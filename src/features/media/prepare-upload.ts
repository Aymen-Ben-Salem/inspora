import { isOptimizableStaticImage, type OptimizedImage } from "../admin/image-optimization";
import type {
  MediaUploadCompletionResult,
  MediaUploadKind,
  MediaUploadSignatureResult,
  UploadedAdminMedia,
} from "../admin/media-upload";

export type PreparedMediaUploadRole =
  | "primary"
  | "variant"
  | "video-preview"
  | "poster";

export type PreparedMediaUpload = OptimizedImage & {
  uploadKind: MediaUploadKind;
  role: PreparedMediaUploadRole;
};

export type PreparedMediaUploadBundle = {
  source: { file: File; kind: MediaUploadKind };
  primary: PreparedMediaUpload;
  derivatives: readonly PreparedMediaUpload[];
  outputs: readonly PreparedMediaUpload[];
};

export type UploadTransferStatus = "signing" | "uploading" | "verifying";

export type MediaUploadOperations<TResult> = {
  upload(
    bundle: PreparedMediaUploadBundle,
    onStatus: (status: UploadTransferStatus) => void,
  ): Promise<TResult>;
  converterConfiguration(): Promise<{ coreUrl: string; wasmUrl: string }>;
};

export function createPreparedMediaUploadBundle(input: {
  source: File;
  kind: MediaUploadKind;
  outputs: readonly PreparedMediaUpload[];
}): PreparedMediaUploadBundle {
  const primaryOutputs = input.outputs.filter((output) => output.role === "primary");
  if (primaryOutputs.length !== 1) {
    throw new Error("A prepared upload must contain exactly one primary output.");
  }

  return {
    source: { file: input.source, kind: input.kind },
    primary: primaryOutputs[0]!,
    derivatives: input.outputs.filter((output) => output.role !== "primary"),
    outputs: [...input.outputs],
  };
}

type AdminUploadActions = {
  sign(input: unknown): Promise<MediaUploadSignatureResult>;
  complete(input: unknown): Promise<MediaUploadCompletionResult>;
  discard(input: { kind: string; storageKeys: string[] }): Promise<unknown>;
  converterConfiguration(): Promise<{ coreUrl: string; wasmUrl: string }>;
};

export function createAdminMediaUploadOperations(
  actions: AdminUploadActions,
): MediaUploadOperations<UploadedAdminMedia> {
  return {
    converterConfiguration: actions.converterConfiguration,
    async upload(bundle, onStatus) {
      let uploadedStorageKeys: string[] = [];
      const uploadItems = bundle.outputs;

      try {
        onStatus("signing");
        const signatures = await Promise.all(
          uploadItems.map((item) =>
            actions.sign({
              kind: item.uploadKind,
              fileName: item.file.name,
              contentType: item.file.type,
              size: item.file.size,
            }),
          ),
        );
        const rejectedSignature = signatures.find((signature) => !signature.ok);
        if (rejectedSignature && !rejectedSignature.ok) {
          throw new Error(rejectedSignature.message);
        }
        const prepared = signatures.filter(
          (signature): signature is Extract<typeof signature, { ok: true }> => signature.ok,
        );
        uploadedStorageKeys = prepared.map((signature) => signature.storageKey);

        onStatus("uploading");
        const responses = await Promise.all(
          prepared.map((signature, index) =>
            fetch(signature.uploadUrl, {
              method: signature.method,
              headers: signature.headers,
              body: uploadItems[index]?.file,
            }),
          ),
        );
        if (responses.some((response) => !response.ok)) {
          throw new Error("The storage service rejected the upload.");
        }

        onStatus("verifying");
        const completed = await Promise.all(
          prepared.map((signature, index) => {
            const item = uploadItems[index];
            return actions.complete({
              kind: item?.uploadKind,
              fileName: bundle.source.file.name,
              contentType: item?.file.type,
              size: item?.file.size,
              storageKey: signature.storageKey,
              width: item?.width,
              height: item?.height,
            });
          }),
        );
        const rejectedCompletion = completed.find((result) => !result.ok);
        if (rejectedCompletion && !rejectedCompletion.ok) {
          throw new Error(rejectedCompletion.message);
        }
        const uploaded = completed.filter(
          (result): result is Extract<typeof result, { ok: true }> => result.ok,
        );
        const primaryIndex = uploadItems.indexOf(bundle.primary);
        const primary = uploaded[primaryIndex]?.media;
        if (!primary) throw new Error("The optimized upload returned no media.");
        const posterIndex = uploadItems.findIndex((item) => item.role === "poster");
        const poster = posterIndex >= 0 ? uploaded[posterIndex]?.media : undefined;
        const videoPreviewIndex = uploadItems.findIndex(
          (item) => item.role === "video-preview",
        );
        const videoPreviewMedia =
          videoPreviewIndex >= 0 ? uploaded[videoPreviewIndex]?.media : undefined;

        uploadedStorageKeys = [];
        return {
          ...primary,
          sourceMimeType: bundle.source.file.type,
          posterUrl: poster?.url,
          posterStorageKey: poster?.storageKey,
          videoPreview: videoPreviewMedia?.storageKey
            ? {
                url: videoPreviewMedia.url,
                storageKey: videoPreviewMedia.storageKey,
                width: videoPreviewMedia.width,
                height: videoPreviewMedia.height,
                bytes: videoPreviewMedia.sizeBytes!,
                format: "mp4",
              }
            : undefined,
          variants:
            isOptimizableStaticImage(bundle.source.file.type) &&
            (bundle.source.kind === "post-media" ||
              bundle.source.kind === "logo-media" ||
              bundle.source.kind === "website-section")
              ? uploaded
                  .filter((_, index) => uploadItems[index]?.role === "variant")
                  .map(({ media }) => ({
                    url: media.url,
                    storageKey: media.storageKey!,
                    width: media.width,
                    height: media.height,
                    bytes: media.sizeBytes!,
                    format: "webp" as const,
                  }))
              : [],
        };
      } catch (error) {
        if (uploadedStorageKeys.length) {
          await actions
            .discard({ kind: bundle.source.kind, storageKeys: uploadedStorageKeys })
            .catch(() => undefined);
        }
        throw error;
      }
    },
  };
}
