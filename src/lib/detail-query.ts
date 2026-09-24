export type DetailQuerySelection = {
  key: "logo" | "website";
  value: string;
};

const DETAIL_QUERY_KEYS = ["logo", "website"] as const;

export function detailPageHref(
  pathname: string,
  currentSearch: string,
  selection?: DetailQuerySelection,
) {
  const searchParams = new URLSearchParams(currentSearch);
  DETAIL_QUERY_KEYS.forEach((key) => searchParams.delete(key));
  if (selection) searchParams.set(selection.key, selection.value);
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function replaceDetailQueryParam(selection?: DetailQuerySelection) {
  window.history.replaceState(
    null,
    "",
    detailPageHref(window.location.pathname, window.location.search, selection),
  );
}

// Opening from an archive needs its own history entry. Moving between details
// replaces that entry so Back always returns to the same archive and filters.
export function openArchiveDetail(selection: DetailQuerySelection) {
  const { pathname, search } = window.location;
  const href = detailPageHref(pathname, search, selection);
  if (new URLSearchParams(search).has(selection.key)) {
    const owner = window.history.state?.archiveDetailPath;
    window.history.replaceState(owner ? { archiveDetailPath: owner } : null, "", href);
  } else {
    window.history.pushState({ archiveDetailPath: pathname }, "", href);
  }
}

export function closeArchiveDetail() {
  if (window.history.state?.archiveDetailPath === window.location.pathname) {
    window.history.back();
  } else {
    // A directly loaded detail has no archive entry to return to.
    replaceDetailQueryParam();
  }
}
