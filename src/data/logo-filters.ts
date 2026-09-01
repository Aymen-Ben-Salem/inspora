import type { Logo, LogoKind } from "@/domain/logo";

export type LogoFilters = {
  query: string;
  kind: LogoKind;
  colors: string[];
  industries: string[];
  styles: string[];
  shapes: string[];
};

function includesEvery(values: string[], selected: string[]) {
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return selected.every((value) => normalized.has(value.toLowerCase()));
}

export function matchesLogoFilters(logo: Logo, filters: LogoFilters) {
  if (logo.kind !== filters.kind) return false;
  if (
    filters.colors.length > 0 &&
    !includesEvery(logo.colors, filters.colors)
  ) {
    return false;
  }
  if (
    filters.industries.length > 0 &&
    !includesEvery([logo.industry], filters.industries)
  ) {
    return false;
  }
  if (
    filters.styles.length > 0 &&
    !includesEvery(logo.styles, filters.styles)
  ) {
    return false;
  }
  if (
    filters.shapes.length > 0 &&
    !includesEvery([logo.shape], filters.shapes)
  ) {
    return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;

  return [
    logo.title,
    logo.creator.name,
    logo.description,
    logo.industry,
    logo.shape,
    ...logo.colors,
    ...logo.styles,
  ].some((value) => value.toLowerCase().includes(query));
}
