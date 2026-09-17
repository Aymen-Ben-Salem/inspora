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
