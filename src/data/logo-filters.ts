import type { Logo, LogoKind } from "@/domain/logo";
import { matchesArchiveFilterSelection } from "./archive-filters";

export type LogoFilters = {
  query: string;
  kind: LogoKind;
  colors: string[];
  industries: string[];
  styles: string[];
  shapes: string[];
};

export function splitLogoFilterValues(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function getLogoFilterOptions(logos: Logo[], kind: LogoKind) {
  const source = logos.filter((logo) => logo.kind === kind);
  const withCounts = (valuesFor: (logo: Logo) => string[]) => {
    const values = [...new Set(source.flatMap(valuesFor).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    return values.map((value) => ({
      value,
      count: source.filter((logo) => valuesFor(logo).includes(value)).length,
    }));
  };
  return {
    colors: withCounts((logo) => logo.colors),
    industries: withCounts((logo) => splitLogoFilterValues(logo.industry)),
    styles: withCounts((logo) => logo.styles),
    shapes: withCounts((logo) => splitLogoFilterValues(logo.shape)),
  };
}

export function matchesLogoFilters(logo: Logo, filters: LogoFilters) {
  if (logo.kind !== filters.kind) return false;
  if (!matchesArchiveFilterSelection([
    { values: logo.colors, selected: filters.colors },
    { values: splitLogoFilterValues(logo.industry), selected: filters.industries },
    { values: logo.styles, selected: filters.styles },
    { values: splitLogoFilterValues(logo.shape), selected: filters.shapes },
  ])) {
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
