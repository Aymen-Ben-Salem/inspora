function getMediaElement(element: HTMLElement | undefined) {
  if (
    element instanceof HTMLImageElement ||
    element instanceof HTMLVideoElement
  ) {
    return element;
  }

  return element?.querySelector<HTMLImageElement | HTMLVideoElement>(
    "img, video",
  );
}

function getImageSource(media: HTMLImageElement) {
  return media.currentSrc || media.src;
}

function getVideoSource(video: HTMLVideoElement) {
  return video.currentSrc || video.src;
}

type MediaProxyRect = Pick<DOMRect, "height" | "left" | "top" | "width">;

export function resolveFeedTransitionTarget(source: HTMLElement | undefined) {
  return (
    source?.querySelector<HTMLElement>("[data-feed-transition-target]") ??
    source
  );
}

export function resolveProxyObjectFit(objectFit: string) {
  return objectFit === "contain" ? "contain" : "cover";
}

export function resolveProxyObjectPosition(
  objectPosition: string,
  override: string | undefined,
) {
  return override?.trim() || objectPosition;
}

export function resolveExitMediaRect({
  heroRect,
  matchSourceAspectRatio,
  sourceRect,
}: {
  heroRect: MediaProxyRect;
  matchSourceAspectRatio: boolean;
  sourceRect: MediaProxyRect | undefined;
}): MediaProxyRect {
  if (
    !matchSourceAspectRatio ||
    !sourceRect ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0
  ) {
    return heroRect;
  }

  return {
    height: heroRect.width * (sourceRect.height / sourceRect.width),
    left: heroRect.left,
    top: heroRect.top,
    width: heroRect.width,
  };
}

export function shouldAnimateDialogBackdrop(
  hero: Pick<HTMLElement, "hasAttribute">,
) {
  return !hero.hasAttribute("data-post-dialog-transparent-media");
}

export function resolveProxyTargetBoxShadow(animateBackdrop: boolean) {
  return animateBackdrop
    ? "0 18px 60px rgba(0, 0, 0, 0.12)"
    : "0 0 0 rgba(0, 0, 0, 0)";
}

export function getIntrinsicMediaAspectRatio(
  element: HTMLElement | undefined,
) {
  const media = getMediaElement(element);

  if (
    media instanceof HTMLImageElement &&
    media.naturalWidth > 0 &&
    media.naturalHeight > 0
  ) {
    return media.naturalWidth / media.naturalHeight;
  }

  if (
    media instanceof HTMLVideoElement &&
    media.videoWidth > 0 &&
    media.videoHeight > 0
  ) {
    return media.videoWidth / media.videoHeight;
  }

  return undefined;
}

function cloneImage(source: HTMLImageElement) {
  const image = source.cloneNode(false) as HTMLImageElement;

  image.removeAttribute("sizes");
  image.removeAttribute("srcset");
  image.src = getImageSource(source);

  return image;
}

function configureProxyMedia(
  proxyMedia: HTMLImageElement | HTMLVideoElement,
  sourceMedia: HTMLImageElement | HTMLVideoElement,
  media: HTMLElement,
) {
  const objectPositionOverride =
    media.dataset.postDialogProxyObjectPosition;

  Object.assign(proxyMedia.style, {
    display: "block",
    height: "100%",
    objectFit: resolveProxyObjectFit(getComputedStyle(sourceMedia).objectFit),
    objectPosition: resolveProxyObjectPosition(
      getComputedStyle(sourceMedia).objectPosition,
      objectPositionOverride,
    ),
    width: "100%",
  });

  if (objectPositionOverride) proxyMedia.style.transform = "none";

  proxyMedia.draggable = false;

  if (proxyMedia instanceof HTMLImageElement) {
    proxyMedia.alt = "";
    proxyMedia.decoding = "async";
  }
}

function createVideoProxy(source: HTMLVideoElement) {
  if (source.poster) {
    const poster = document.createElement("img");
    poster.src = source.poster;
    return poster;
  }

  const src = getVideoSource(source);

  if (!src) return undefined;

  const video = document.createElement("video");
  const syncPlayback = () => {
    if (Number.isFinite(source.currentTime)) {
      try {
        video.currentTime = source.currentTime;
      } catch {
        // Metadata may not be ready yet; playback still starts from the poster.
      }
    }

    void video.play().catch(() => undefined);
  };

  video.autoplay = true;
  video.controls = false;
  video.dataset.loopingVideo = "";
  video.defaultMuted = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.poster = source.poster;
  video.src = src;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    syncPlayback();
  } else {
    video.addEventListener("loadedmetadata", syncPlayback, { once: true });
  }

  return video;
}

export function getCornerRadius(element: HTMLElement) {
  return Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
}

export function getCompensatedRadius(
  visualRadius: number,
  scaleX: number,
  scaleY: number,
) {
  const averageScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
  return averageScale > 0 ? visualRadius / averageScale : visualRadius;
}

export function createMediaProxy({
  fallback,
  media,
  rect,
  root,
  mediaSourcePreference = "media",
}: {
  fallback?: HTMLElement;
  media: HTMLElement;
  rect: MediaProxyRect;
  root: HTMLElement;
  mediaSourcePreference?: "fallback" | "media";
}) {
  const primaryMedia = getMediaElement(media);
  const fallbackMedia = getMediaElement(fallback);
  const mediaElement =
    mediaSourcePreference === "fallback"
      ? fallbackMedia ?? primaryMedia
      : primaryMedia ?? fallbackMedia;

  if (!mediaElement) return undefined;

  const proxyMedia =
    mediaElement instanceof HTMLVideoElement
      ? createVideoProxy(mediaElement)
      : mediaElement instanceof HTMLImageElement
        ? cloneImage(mediaElement)
        : undefined;

  if (!proxyMedia) return undefined;

  const proxy = document.createElement("div");

  proxy.dataset.postDialogMediaProxy = "";
  Object.assign(proxy.style, {
    background: getComputedStyle(media).backgroundColor,
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    overflow: "hidden",
    pointerEvents: "none",
    position: "fixed",
    top: `${rect.top}px`,
    transformOrigin: "top left",
    width: `${rect.width}px`,
    willChange: "transform, border-radius, box-shadow",
    zIndex: "3",
  });

  configureProxyMedia(proxyMedia, mediaElement, media);
  proxy.appendChild(proxyMedia);
  root.appendChild(proxy);

  return proxy;
}
