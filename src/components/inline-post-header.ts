const FILTER_SELECTOR = "[data-header-filters]";

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
