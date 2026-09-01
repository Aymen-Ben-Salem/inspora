export type SiteNavigationHref = "/" | "/websites" | "/logos" | "/info";

type SiteNavigationLink = {
  kind: "link";
  label: string;
  href: SiteNavigationHref;
};

type SiteNavigationAction = {
  kind: "action";
  label: string;
  action: "contact";
};

export type SiteNavigationItem = SiteNavigationLink | SiteNavigationAction;

export const SITE_NAV_ITEMS = [
  { kind: "link", label: "Design", href: "/" },
  { kind: "link", label: "Websites", href: "/websites" },
  { kind: "link", label: "Logos", href: "/logos" },
  { kind: "action", label: "Contact", action: "contact" },
  { kind: "link", label: "Info", href: "/info" },
] as const satisfies ReadonlyArray<SiteNavigationItem>;

