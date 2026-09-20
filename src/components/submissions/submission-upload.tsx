"use client";

import Image from "next/image";
import { useCallback } from "react";

import type { PrivateUploadTicket } from "../../features/submissions/types";

type UploadKind = "design" | "logo";

const uploadPolicies = {
  design: {
    accept:
      "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm",
    heading: "Upload your design",
    support: "Supports JPG, PNG, WebP, AVIF, GIF, MP4 or WebM",
    limit: "Images and GIFs up to 10 MB; videos up to 50 MB",
  },
  logo: {
    accept: "image/jpeg,image/png,image/webp,image/avif",
    heading: "Upload your logo",
    support: "Supports JPG, PNG, WebP or AVIF",
    limit: "Maximum file size: 10 MB",
  },
} as const;

export function submissionUploadPolicy(kind: UploadKind) {
  return uploadPolicies[kind];
}

export type UploadRequest = {
  status: number;
  upload: {
    addEventListener(
      name: "progress",
      listener: (event: {
        lengthComputable: boolean;
        loaded: number;
        total: number;
      }) => void,
    ): void;
  };
  addEventListener(
    name: "load" | "error" | "abort" | "timeout",
    listener: () => void,
  ): void;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(file: Blob): void;
};

export function uploadSubmissionFile({
  createRequest = () => new XMLHttpRequest() as UploadRequest,
  file,
  onProgress,
  ticket,
}: {
  createRequest?: () => UploadRequest;
  file: Blob;
  onProgress?: (percentage: number) => void;
  ticket: PrivateUploadTicket;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = createRequest();
    request.open(ticket.method, ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${request.status}`));
      }
    });
    const fail = () => reject(new Error("Upload did not complete."));
    request.addEventListener("error", fail);
    request.addEventListener("abort", fail);
    request.addEventListener("timeout", fail);
    request.send(file);
  });
}

export function SubmissionUpload({
  disabled,
  file,
  kind,
  onFile,
}: {
  disabled?: boolean;
  file: File | null;
  kind: UploadKind;
  onFile: (file: File | null) => void;
}) {
  const copy = submissionUploadPolicy(kind);

  return (
    <div>
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!disabled && event.dataTransfer.files.length === 1) {
            onFile(event.dataTransfer.files[0]);
          }
        }}
        className="focus-within:focus-ring flex min-h-[244px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-[#cfcfcf] bg-[#fcfcfc] px-6 text-center"
      >
        {file ? (
          <SelectedUploadPreview
            key={`${file.name}:${file.size}:${file.lastModified}:${file.type}`}
            file={file}
          />
        ) : (
          <>
            <Image
              src="/icons/submissions/upload.svg"
              alt=""
              width={56}
              height={56}
              aria-hidden="true"
            />
            <span className="mt-4 text-sm font-medium tracking-[-0.28px] text-[#262626]">
              Drop your image here or click to browse
            </span>
            <span className="mt-2 text-xs tracking-[-0.24px] text-[#767676]">
              {copy.support}
            </span>
            <span className="mt-1 text-xs tracking-[-0.24px] text-[#767676]">
              {copy.limit}
            </span>
          </>
        )}
        <input
          type="file"
          accept={copy.accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            onFile(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </label>
      {file ? (
        <div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#767676]">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFile(null)}
            className="focus-ring text-[#262626]"
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SelectedUploadPreview({ file }: { file: File }) {
  const attachPreview = useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      if (!node) return;
      const previewUrl = URL.createObjectURL(file);
      node.src = previewUrl;
      return () => URL.revokeObjectURL(previewUrl);
    },
    [file],
  );

  return file.type.startsWith("video/") ? (
    <video
      ref={attachPreview}
      muted
      playsInline
      className="max-h-[214px] max-w-full object-contain"
    />
  ) : (
    // The object URL is local-only and intentionally bypasses optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={attachPreview}
      alt="Selected upload preview"
      className="max-h-[214px] max-w-full object-contain"
    />
  );
}
