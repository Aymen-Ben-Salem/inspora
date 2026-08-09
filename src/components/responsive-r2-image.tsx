import type { ComponentProps } from "react";

import type { ImageVariant } from "@/storage/types";

type ResponsiveR2ImageProps = Omit<
  ComponentProps<"img">,
  | "src"
  | "srcSet"
  | "width"
  | "height"
  | "loading"
  | "fetchPriority"
  | "alt"
> & {
  src: string;
  alt: string;
  width: number;
  height: number;
  variants?: ImageVariant[];
  sizes?: string;
  priority?: boolean;
};

export function ResponsiveR2Image({
  src,
  alt,
  width,
  height,
  variants = [],
  sizes,
  priority = false,
  ...props
}: ResponsiveR2ImageProps) {
  const sources = [...variants, { url: src, width }]
    .filter(
      (source, index, entries) =>
        entries.findIndex((candidate) => candidate.width === source.width) === index,
    )
    .sort((left, right) => left.width - right.width);

  return (
    // R2 variants are already optimized; native srcset avoids Vercel transformations.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={src}
      alt={alt}
      srcSet={sources.map((source) => `${source.url} ${source.width}w`).join(", ")}
      sizes={sizes}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
