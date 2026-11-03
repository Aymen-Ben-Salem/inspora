import type { Route } from "next";

export const MEMBER_PAGE_SIZE = 25;
export const MEMBER_FILTERS = {
  all: "All members",
  joined7: "Joined in 7 days",
  joined30: "Joined in 30 days",
  active30: "Active in 30 days",
} as const;
export const MEMBER_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  active: "Recently active",
} as const;

export type MemberSearchParams = Record<string, string | string[] | undefined>;
export type MemberQuery = {
  query: string;
  page: number;
  filter: keyof typeof MEMBER_FILTERS;
  sort: keyof typeof MEMBER_SORTS;
};
export type AdminMember = {
  id: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  xUsername: string | null;
  joinedAt: number | null;
  lastSignInAt: number | null;
};
export type MemberSummary = {
  total: number | null;
  joined7: number | null;
  joined30: number | null;
  active30: number | null;
};
export type MembersResult = {
  query: MemberQuery;
  summary: MemberSummary;
  list: {
    rows: AdminMember[];
    total: number;
    totalPages: number;
  } | null;
};

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberQuery(raw: MemberSearchParams): MemberQuery {
  const page = Number(firstParam(raw.page));
  const filter = firstParam(raw.filter);
  const sort = firstParam(raw.sort);
  return {
    query: (firstParam(raw.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 254),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 40_000) : 1,
    filter: filter && Object.hasOwn(MEMBER_FILTERS, filter) ? filter as MemberQuery["filter"] : "all",
    sort: sort && Object.hasOwn(MEMBER_SORTS, sort) ? sort as MemberQuery["sort"] : "newest",
  };
}

export function membersHref(query: MemberQuery, changes: Partial<MemberQuery> = {}): Route {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.filter !== "all") params.set("filter", next.filter);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  return `/admin/subscribers${params.size ? `?${params}` : ""}` as Route;
}
