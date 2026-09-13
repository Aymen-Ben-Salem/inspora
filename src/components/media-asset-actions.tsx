"use client";

import Image from "next/image";
import { useState } from "react";

import { detailSecondaryActionClassName } from "./detail-sidebar-primitives";

type AssetTransformer = (blob: Blob) => Promise<Blob>;

async function fetchAsset(assetUrl: string) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error("The image could not be loaded.");
  return response.blob();
}

async function toClipboardPng(blob: Blob) {
  if (blob.type === "image/png") return blob;

  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image could not be prepared.");
    context.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) =>
          png
            ? resolve(png)
            : reject(new Error("The image could not be copied.")),
        "image/png",
      );
    });
  } finally {
    image.close();
  }
}

function triggerDownload(url: string, fileName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName ?? "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function MediaAssetActions({
  assetKey,
  assetUrl,
  copyText,
  copyLabel,
  downloadFileName,
  downloadLabel = "Download",
  transformAsset,
}: {
  assetKey: string;
  assetUrl?: string;
  copyText?: string;
  copyLabel: string;
  downloadFileName?: string;
  downloadLabel?: string;
  transformAsset?: AssetTransformer;
}) {
  const [copyStatus, setCopyStatus] = useState<{
    assetKey: string;
    state: "copied" | "error";
  }>();
  const copyState =
    copyStatus?.assetKey === assetKey ? copyStatus.state : "idle";
  const copyDisabled = !assetUrl && !copyText;
  const downloadDisabled = !assetUrl;

  async function copyAsset() {
    if (!assetUrl && !copyText) return;

    try {
      if (copyText) {
        await navigator.clipboard.writeText(copyText);
        setCopyStatus({ assetKey, state: "copied" });
        return;
      }
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined" || !assetUrl) {
        throw new Error("Image clipboard is unavailable.");
      }
      const png = fetchAsset(assetUrl)
        .then((blob) => (transformAsset ? transformAsset(blob) : blob))
        .then(toClipboardPng);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setCopyStatus({ assetKey, state: "copied" });
    } catch {
      setCopyStatus({ assetKey, state: "error" });
    }
  }

  async function downloadAsset() {
    if (!assetUrl) return;

    if (!transformAsset) {
      triggerDownload(assetUrl, downloadFileName);
      return;
    }

    try {
      const blob = await transformAsset(await fetchAsset(assetUrl));
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, downloadFileName);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      // Keep the controls stable if a remote asset becomes unavailable.
    }
  }

  const disabledClassName =
    "disabled:cursor-not-allowed disabled:bg-[#f0f0f0] disabled:text-[#767676] disabled:opacity-50 disabled:[&_img]:opacity-50";

  return (
    <div className="detail-secondary-actions grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={copyDisabled}
        onClick={() => void copyAsset()}
        className={`${detailSecondaryActionClassName} detail-fit-action gap-2.5 ${disabledClassName}`}
      >
        <Image
          src="/icons/detail/copy.svg"
          alt=""
          aria-hidden="true"
          className="detail-secondary-action-icon size-5 shrink-0"
          width={24}
          height={24}
        />
        {copyState === "copied"
          ? "Copied"
          : copyState === "error"
            ? "Copy unavailable"
            : copyLabel}
      </button>
      <button
        type="button"
        disabled={downloadDisabled}
        onClick={() => void downloadAsset()}
        className={`${detailSecondaryActionClassName} detail-fit-action gap-2.5 ${disabledClassName}`}
      >
        <Image
          src="/icons/detail/download.svg"
          alt=""
          aria-hidden="true"
          className="detail-secondary-action-icon size-5 shrink-0"
          width={24}
          height={24}
        />
        {downloadLabel}
      </button>
    </div>
  );
}
