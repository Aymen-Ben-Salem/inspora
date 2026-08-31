type SiteNavigationLink = {
  kind: "link";
  label: string;
  href: "/" | "/websites" | "/logos" | "/info";
};

type SiteNavigationAction = {
  kind: "action";
  label: string;
  action: "contact";
};

export type SiteNavigationItem = SiteNavigationLink | SiteNavigationAction;

export const SITE_NAV_ITEMS = [
  { kind: "link", label: "design", href: "/" },
  { kind: "link", label: "websites", href: "/websites" },
  { kind: "link", label: "logos", href: "/logos" },
  { kind: "action", label: "contact", action: "contact" },
  { kind: "link", label: "info", href: "/info" },
] as const satisfies ReadonlyArray<SiteNavigationItem>;

