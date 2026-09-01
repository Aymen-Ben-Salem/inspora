import Image from "next/image";

import type { MediaStorageProvider } from "@/storage/types";

import { ResponsiveR2Image } from "./responsive-r2-image";

type CreatorAvatarData = {
  avatarStorageProvider?: MediaStorageProvider;
  avatarUrl: string;
};

export function CreatorAvatar({
  className,
  creator,
  height,
  role,
  sizes,
  width,
}: {
  className: string;
  creator: CreatorAvatarData;
  height: number;
  role: "dialog" | "feed";
  sizes: string;
  width: number;
}) {
  const transitionAttributes =
    role === "feed"
      ? { "data-feed-creator-avatar": "" }
      : { "data-post-dialog-creator-avatar": "" };

  return creator.avatarStorageProvider === "r2" ? (
    <ResponsiveR2Image
      {...transitionAttributes}
      src={creator.avatarUrl}
      alt=""
      width={width}
      height={height}
      sizes={sizes}
      className={className}
    />
  ) : (
    <Image
      {...transitionAttributes}
      src={creator.avatarUrl}
      alt=""
      width={width}
      height={height}
      className={className}
    />
  );
}
