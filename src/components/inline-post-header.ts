const FILTER_SELECTOR = "[data-header-filters]";
const HEADER_SCROLL_LOCK_EVENT = "inspora:lock-secondary-header";

export function isSecondaryHeaderScrollLocked() {
  return "secondaryHeaderScrollLocked" in document.documentElement.dataset;
}

export function lockSecondaryHeaderThroughNavigation() {
  document.documentElement.dataset.secondaryHeaderScrollLocked = "";
  window.dispatchEvent(new Event(HEADER_SCROLL_LOCK_EVENT));

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      delete document.documentElement.dataset.secondaryHeaderScrollLocked;
    });
  });
}

export function subscribeToSecondaryHeaderLock(listener: () => void) {
  window.addEventListener(HEADER_SCROLL_LOCK_EVENT, listener);
  return () => window.removeEventListener(HEADER_SCROLL_LOCK_EVENT, listener);
}

export function suppressFiltersForInlinePost() {
  document.documentElement.dataset.inlinePostOpen = "";

  const filters = document.querySelector<HTMLElement>(FILTER_SELECTOR);
  if (!filters) return;

  filters.style.setProperty("visibility", "hidden", "important");
  filters.style.setProperty("pointer-events", "none", "important");
  filters.style.setProperty("opacity", "0", "important");
  filters.style.setProperty("transform", "translateY(-8px)", "important");
}

export function restoreFiltersAfterInlinePost() {
  delete document.documentElement.dataset.inlinePostOpen;

  const filters = document.querySelector<HTMLElement>(FILTER_SELECTOR);
  if (!filters) return;

  filters.style.removeProperty("visibility");
  filters.style.removeProperty("pointer-events");
  filters.style.removeProperty("opacity");
  filters.style.removeProperty("transform");
}
