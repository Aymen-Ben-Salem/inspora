"use client";

import { getImageProps } from "next/image";
import { useCallback, type ComponentProps } from "react";

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
  onError,
  ref,
  ...props
}: ResponsiveR2ImageProps) {
  const sources = [...variants, { url: src, width }]
    .filter(
      (source, index, entries) =>
        entries.findIndex((candidate) => candidate.width === source.width) === index,
    )
    .sort((left, right) => left.width - right.width);
  const sourcePath = src.split(/[?#]/, 1)[0];
  const canOptimize =
    /^(https?:\/\/|\/(?!\/))/.test(src) && !/\.(gif|svg)$/i.test(sourcePath);
  const usesOptimizer = variants.length === 0 && canOptimize;
  // Legacy/external assets have no generated variants. Only use Next's delivery
  // attributes so the native image retains its intrinsic proportions and styles.
  const image =
    usesOptimizer
      ? getImageProps({ src, alt, width, height, sizes }).props
      : {
          src,
          srcSet: sources.map((source) => `${source.url} ${source.width}w`).join(", "),
        };
  const restoreOriginalSource = useCallback((node: HTMLImageElement) => {
    if (node.getAttribute("src") === src) return false;
    // A URL without an extension can still return SVG or reject the optimizer.
    // Retry the browser-readable original once without changing native sizing.
    node.setAttribute("srcset", `${src} ${width}w`);
    node.setAttribute("src", src);
    return true;
  }, [src, width]);
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    // An SSR image can fail before React attaches its error listener.
    if (node?.complete && node.naturalWidth === 0) restoreOriginalSource(node);
    if (typeof ref === "function") return ref(node);
    if (ref) ref.current = node;
  }, [ref, restoreOriginalSource]);

  return (
    // R2 variants are already optimized; native srcset avoids Vercel transformations.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={usesOptimizer ? imageRef : ref}
      onError={usesOptimizer ? (event) => {
        if (!restoreOriginalSource(event.currentTarget)) onError?.(event);
      } : onError}
      alt={alt}
      sizes={sizes}
      srcSet={image.srcSet}
      src={image.src}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
