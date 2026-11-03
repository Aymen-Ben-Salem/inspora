import type { User } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";

import { membersHref, parseMemberQuery } from "./members-data";
import { createMembersReader, type MembersDirectory } from "./members-service";

const at = Date.UTC(2026, 10, 3, 12);
const day = 86_400_000;
const account = {
  id: "member-fixture", firstName: "Sam", lastName: "Example", username: "sam",
  hasImage: true, imageUrl: "https://img.clerk.com/fixture", createdAt: at - day, lastSignInAt: null,
  primaryEmailAddressId: "primary",
  emailAddresses: [{ id: "secondary", emailAddress: "private-secondary@example.com" }, { id: "primary", emailAddress: "sam@example.com" }],
  externalAccounts: [{ provider: "oauth_x", username: "samexample", verification: { status: "verified" } }],
  privateMetadata: { secret: "must-not-reach-view" }, phoneNumbers: ["must-not-reach-view"],
} as unknown as User;

function setup() {
  const authorize = vi.fn(async () => {});
  const source = {
    getCount: vi.fn(async () => 70),
    getUserList: vi.fn<MembersDirectory["getUserList"]>(async (options) => ({ data: options.limit === 1 ? [] : [account], totalCount: options.limit === 1 ? (options.createdAtAfter === at - day ? 3 : 12) : 70 })),
  };
  const directory = vi.fn(async () => source);
  let clock = at;
  return { source, authorize, directory, advance: (ms: number) => { clock += ms; }, read: createMembersReader({ authorize, directory, now: () => clock }) };
}

describe("admin member directory", () => {
  it("authorizes every read before accessing the provider, even with cached counts", async () => {
    const s = setup();
    await s.read({});
    s.authorize.mockRejectedValueOnce(new Error("not-admin"));
    await expect(s.read({})).rejects.toThrow("not-admin");
    expect(s.directory).toHaveBeenCalledTimes(1);
    expect(s.authorize).toHaveBeenCalledTimes(2);
  });

  it("returns only the primary email and verified X identity, never the whole account", async () => {
    const { read } = setup();
    const result = await read({});
    expect(result.list?.rows[0]).toEqual({ id: "member-fixture", name: "Sam Example", email: "sam@example.com", imageUrl: "https://img.clerk.com/fixture", xUsername: "samexample", joinedAt: at - day, lastSignInAt: null });
    expect(JSON.stringify(result)).not.toMatch(/private-secondary|must-not-reach-view|privateMetadata|phoneNumbers/);
  });

  it("does not substitute an unverified X account or secondary email, or render unsafe avatars", async () => {
    const s = setup();
    s.source.getUserList.mockResolvedValue({ data: [{ ...account, primaryEmailAddressId: null, imageUrl: "http://127.0.0.1/private", externalAccounts: [{ ...account.externalAccounts[0], verification: null }] }], totalCount: 1 });
    expect((await s.read({})).list?.rows[0]).toMatchObject({ email: null, imageUrl: null, xUsername: null });
  });

  it("uses rolling date filters and paginates the searched list without filtering global metrics", async () => {
    const s = setup();
    const result = await s.read({ q: "  Sam  ", filter: "active30", sort: "active", page: "2" });
    expect(s.source.getUserList).toHaveBeenCalledWith({ limit: 25, offset: 25, query: "Sam", orderBy: "-last_active_at", lastActiveAtAfter: at - 30 * day });
    expect(s.source.getUserList).toHaveBeenCalledWith({ limit: 1, createdAtAfter: at - 7 * day });
    expect(s.source.getUserList).toHaveBeenCalledWith({ limit: 1, createdAtAfter: at - 30 * day });
    expect(s.source.getUserList).toHaveBeenCalledWith({ limit: 1, lastActiveAtAfter: at - 30 * day });
    expect(result.summary).toEqual({ total: 70, joined24h: 3, joined7: 12, joined30: 12, active30: 12 });
    expect(result.list?.totalPages).toBe(3);
  });

  it("deduplicates concurrent summary reads, expires them after a minute, and never caches rows", async () => {
    const s = setup();
    await Promise.all([s.read({}), s.read({ q: "example" })]);
    expect(s.source.getCount).toHaveBeenCalledTimes(1);
    expect(s.source.getUserList).toHaveBeenCalledTimes(6);
    await s.read({});
    expect(s.source.getUserList).toHaveBeenCalledTimes(7);
    s.advance(60_001);
    await s.read({});
    expect(s.source.getCount).toHaveBeenCalledTimes(2);
  });

  it("clamps an out-of-range page and refetches its rows", async () => {
    const s = setup();
    const result = await s.read({ page: "999" });
    expect(result.query.page).toBe(3);
    expect(s.source.getUserList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50, limit: 25 }));
  });

  it("keeps failures distinct from zero counts and retries failed summaries", async () => {
    const s = setup();
    s.source.getCount.mockRejectedValueOnce(new Error("provider error with sensitive detail"));
    s.source.getUserList.mockImplementation(async (options) => {
      if (options.limit === 25) throw new Error("provider error");
      return { data: [], totalCount: 0 };
    });
    const result = await s.read({});
    expect(result.summary).toEqual({ total: null, joined24h: 0, joined7: 0, joined30: 0, active30: 0 });
    expect(result.list).toBeNull();
    expect(JSON.stringify(result)).not.toContain("provider error");
    await s.read({});
    expect(s.source.getCount).toHaveBeenCalledTimes(2);
  });

  it("returns unavailable if the client cannot be obtained, without swallowing auth failures", async () => {
    const s = setup();
    s.directory.mockRejectedValueOnce(new Error("missing config"));
    expect(await s.read({})).toMatchObject({ list: null, summary: { total: null, joined24h: null, joined7: null, joined30: null, active30: null } });
  });

  it("uses the same rolling 24-hour boundary for the summary and member filter, rather than calendar midnight", async () => {
    const s = setup();
    const users = [at - day - 1, at - day, at - day + 1, at - 2 * 3_600_000].map((createdAt, index) => ({ ...account, id: `boundary-${index}`, createdAt }));
    s.source.getUserList.mockImplementation(async (options) => {
      const matching = users.filter(user => options.createdAtAfter === undefined || user.createdAt > options.createdAtAfter);
      return { data: matching.slice(0, options.limit), totalCount: matching.length };
    });
    const result = await s.read({ filter: "joined24h" });
    expect(result.summary.joined24h).toBe(2);
    expect(result.list?.rows.map(row => row.id)).toEqual(["boundary-2", "boundary-3"]);
    expect(s.source.getUserList).toHaveBeenCalledWith({ limit: 1, createdAtAfter: at - day });
    expect(s.source.getUserList).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, createdAtAfter: at - day }));
    expect(membersHref(result.query, { page: 2 })).toBe("/admin/subscribers?filter=joined24h&page=2");
  });

  it("normalizes untrusted query values and preserves filters when paging", () => {
    expect(parseMemberQuery({ q: [" Sam\u0000 ", "ignored"], page: "Infinity", filter: "__proto__", sort: "toString" })).toEqual({ query: "Sam", page: 1, filter: "all", sort: "newest" });
    expect(parseMemberQuery({ q: "x".repeat(1000), page: "999999" }).query).toHaveLength(254);
    expect(parseMemberQuery({ page: "999999" }).page).toBe(40000);
    expect(membersHref(parseMemberQuery({ q: "Sam & Lee", filter: "joined7", sort: "oldest" }), { page: 2 })).toBe("/admin/subscribers?q=Sam+%26+Lee&filter=joined7&sort=oldest&page=2");
  });
});
