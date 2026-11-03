import type { User } from "@clerk/nextjs/server";

import {
  MEMBER_PAGE_SIZE,
  parseMemberQuery,
  type AdminMember,
  type MemberQuery,
  type MemberSearchParams,
  type MemberSummary,
  type MembersResult,
} from "./members-data";

type SourceUser = Pick<User, "id" | "firstName" | "lastName" | "username" | "imageUrl" | "hasImage" |
  "primaryEmailAddressId" | "emailAddresses" | "externalAccounts" | "createdAt" | "lastSignInAt">;
type ListOptions = {
  limit: number;
  offset?: number;
  query?: string;
  orderBy?: "-created_at" | "+created_at" | "-last_active_at";
  createdAtAfter?: number;
  lastActiveAtAfter?: number;
};
export type MembersDirectory = {
  getCount(): Promise<number>;
  getUserList(options: ListOptions): Promise<{ data: SourceUser[]; totalCount: number }>;
};

const DAY = 86_400_000;
const EMPTY_SUMMARY: MemberSummary = { total: null, joined7: null, joined30: null, active30: null };
const orderBy = { newest: "-created_at", oldest: "+created_at", active: "-last_active_at" } as const;
const timestamp = (value: number | null) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

function projectMember(user: SourceUser): AdminMember {
  const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  const xAccount = user.externalAccounts.find((account) =>
    ["oauth_x", "oauth_twitter", "x", "twitter"].includes(account.provider.toLowerCase()) &&
    account.verification?.status === "verified" && /^[A-Za-z0-9_]{1,15}$/.test(account.username ?? ""));
  // Render only Clerk-hosted avatars, without forwarding them through our image proxy.
  let imageUrl: string | null = null;
  if (user.hasImage) {
    try {
      const url = new URL(user.imageUrl);
      if (url.protocol === "https:" && ["img.clerk.com", "images.clerk.dev"].includes(url.hostname)) imageUrl = url.href;
    } catch { /* Missing or malformed avatars use initials. */ }
  }
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "Unnamed member",
    email,
    imageUrl,
    xUsername: xAccount?.username ?? null,
    joinedAt: timestamp(user.createdAt),
    lastSignInAt: timestamp(user.lastSignInAt),
  };
}

function filterOptions(filter: MemberQuery["filter"], now: number): Partial<ListOptions> {
  if (filter === "joined7") return { createdAtAfter: now - 7 * DAY };
  if (filter === "joined30") return { createdAtAfter: now - 30 * DAY };
  if (filter === "active30") return { lastActiveAtAfter: now - 30 * DAY };
  return {};
}

/** One directory per server instance. Cache aggregate counts only, never account rows or auth state. */
export function createMembersReader({ authorize, directory, now = Date.now }: {
  authorize: () => Promise<unknown>;
  directory: () => Promise<MembersDirectory>;
  now?: () => number;
}) {
  let cached: { expiresAt: number; summary: MemberSummary } | undefined;
  let pending: Promise<MemberSummary> | undefined;

  function readSummary(source: MembersDirectory, at: number): Promise<MemberSummary> {
    if (cached && cached.expiresAt > at) return Promise.resolve(cached.summary);
    if (pending) return pending;
    pending = Promise.allSettled([
      source.getCount(),
      source.getUserList({ limit: 1, createdAtAfter: at - 7 * DAY }).then((result) => result.totalCount),
      source.getUserList({ limit: 1, createdAtAfter: at - 30 * DAY }).then((result) => result.totalCount),
      source.getUserList({ limit: 1, lastActiveAtAfter: at - 30 * DAY }).then((result) => result.totalCount),
    ]).then((results) => {
      const counts = results.map((result) => result.status === "fulfilled" ? result.value : null);
      const summary = { total: counts[0], joined7: counts[1], joined30: counts[2], active30: counts[3] };
      if (counts.every((count) => count !== null)) cached = { expiresAt: now() + 60_000, summary };
      return summary;
    }).finally(() => { pending = undefined; });
    return pending;
  }

  return async function readMembers(raw: MemberSearchParams): Promise<MembersResult> {
    // Keep authorization outside all data-error handlers, including on a cache hit.
    await authorize();
    const query = parseMemberQuery(raw);
    let source: MembersDirectory;
    try { source = await directory(); }
    catch { return { query, summary: { ...EMPTY_SUMMARY }, list: null }; }
    const at = now();
    const options = { limit: MEMBER_PAGE_SIZE, query: query.query || undefined, orderBy: orderBy[query.sort], ...filterOptions(query.filter, at) };
    const readList = async () => {
      let result = await source.getUserList({ ...options, offset: (query.page - 1) * MEMBER_PAGE_SIZE });
      const totalPages = Math.max(1, Math.ceil(result.totalCount / MEMBER_PAGE_SIZE));
      if (query.page > totalPages) {
        query.page = totalPages;
        result = await source.getUserList({ ...options, offset: (query.page - 1) * MEMBER_PAGE_SIZE });
      }
      return { rows: result.data.map(projectMember), total: result.totalCount, totalPages: Math.max(1, Math.ceil(result.totalCount / MEMBER_PAGE_SIZE)) };
    };
    const [summary, list] = await Promise.all([readSummary(source, at), readList().catch(() => null)]);
    return { query, summary, list };
  };
}
