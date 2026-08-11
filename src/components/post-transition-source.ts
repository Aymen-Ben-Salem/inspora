const TRANSITION_SOURCE_KEY = "inspora:post-transition-source";
const TRANSITION_SOURCE_MAX_AGE = 30_000;

type StoredTransitionSource = {
  capturedAt: number;
  height: number;
  left: number;
  pathname: string;
  returnUrl: string;
  top: number;
  viewportWidth: number;
  width: number;
};

export function capturePostTransitionSource(
  pathname: string,
  element: HTMLElement,
) {
  const rect = element.getBoundingClientRect();
  const source: StoredTransitionSource = {
    capturedAt: Date.now(),
    height: rect.height,
    left: rect.left,
    pathname,
    returnUrl: `${window.location.pathname}${window.location.search}`,
    top: rect.top,
    viewportWidth: window.innerWidth,
    width: rect.width,
  };

  window.sessionStorage.setItem(TRANSITION_SOURCE_KEY, JSON.stringify(source));
}

function getStoredTransitionSource(pathname: string) {
  const value = window.sessionStorage.getItem(TRANSITION_SOURCE_KEY);
  if (!value) return undefined;

  try {
    const source = JSON.parse(value) as StoredTransitionSource;
    const isCurrent = Date.now() - source.capturedAt <= TRANSITION_SOURCE_MAX_AGE;
    const isSameViewport = Math.abs(source.viewportWidth - window.innerWidth) < 1;

    if (
      source.pathname !== pathname ||
      !isCurrent ||
      !isSameViewport ||
      !Number.isFinite(source.left) ||
      !Number.isFinite(source.top) ||
      !Number.isFinite(source.width) ||
      !Number.isFinite(source.height) ||
      source.width <= 0 ||
      source.height <= 0
    ) {
      return undefined;
    }

    return source;
  } catch {
    return undefined;
  }
}

export function getCapturedPostTransitionSource(pathname: string) {
  const source = getStoredTransitionSource(pathname);

  return source
    ? new DOMRect(source.left, source.top, source.width, source.height)
    : undefined;
}

export function getCapturedPostReturnUrl(pathname: string) {
  const returnUrl = getStoredTransitionSource(pathname)?.returnUrl;

  return returnUrl?.startsWith("/") && !returnUrl.startsWith("//")
    ? returnUrl
    : "/";
}
