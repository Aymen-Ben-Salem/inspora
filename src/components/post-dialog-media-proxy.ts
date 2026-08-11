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
) {
  Object.assign(proxyMedia.style, {
    display: "block",
    height: "100%",
    objectFit: "cover",
    objectPosition: getComputedStyle(sourceMedia).objectPosition,
    width: "100%",
  });

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
  rect: DOMRect;
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
    background: "#f3f3f3",
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

  configureProxyMedia(proxyMedia, mediaElement);
  proxy.appendChild(proxyMedia);
  root.appendChild(proxy);

  return proxy;
}
