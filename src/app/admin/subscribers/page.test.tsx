import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ userId: "admin-fixture" })) }));
vi.mock("@/features/admin/members-repository", () => ({ getAdminMembers: vi.fn(async () => ({ query: { query: "", page: 1, filter: "all", sort: "newest" }, summary: { total: 0, joined7: 0, joined30: 0, active30: 0 }, list: { total: 0, totalPages: 1, rows: [] } })) }));
vi.mock("@/features/admin/subscribers-repository", () => ({ getAdminSubscribers: vi.fn(async () => ({ rows: [], total: 101, page: 2, totalPages: 3 })) }));
vi.mock("@/features/admin/actions", () => ({ deleteSubscriberAction: vi.fn(), unsubscribeSubscriberAction: vi.fn() }));

import MembersPage from "./page";
import { EmailSubscribers } from "@/components/admin/email-subscribers";
import { requireAdmin } from "@/auth/require-admin";
import { getAdminMembers } from "@/features/admin/members-repository";
import { getAdminSubscribers } from "@/features/admin/subscribers-repository";

beforeEach(() => vi.clearAllMocks());

it.each([{}, { view: "email" }])("authorizes before either directory can be read (%j)", async (params) => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("unauthorized"));
  await expect(MembersPage({ searchParams: Promise.resolve(params) })).rejects.toThrow("unauthorized");
  expect(getAdminMembers).not.toHaveBeenCalled();
  expect(getAdminSubscribers).not.toHaveBeenCalled();
});

it("shows members by default and keeps the legacy list behind its own link", async () => {
  const html = renderToStaticMarkup(await MembersPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('href="/admin/subscribers?view=email"');
  expect(html).toContain("No members yet");
  expect(getAdminMembers).toHaveBeenCalledOnce();
  expect(getAdminSubscribers).not.toHaveBeenCalled();
});

it("does not query members when the newsletter tab is selected", async () => {
  const page = await MembersPage({ searchParams: Promise.resolve({ view: "email" }) });
  expect(page.props.children[1].type).toBe(EmailSubscribers);
  expect(getAdminMembers).not.toHaveBeenCalled();
});

it("retains newsletter-only search, pagination and the original export route", async () => {
  const html = renderToStaticMarkup(await EmailSubscribers({ searchParams: Promise.resolve({ q: "example", page: "2" }) }));
  expect(getAdminSubscribers).toHaveBeenCalledWith({ query: "example", page: 2 });
  expect(html).toContain('name="view" value="email"');
  expect(html).toContain('action="/admin/subscribers/export"');
  expect(html).toContain("view=email&amp;q=example&amp;page=3");
  expect(html).toContain("Signing up for an account does not subscribe someone to email.");
});
