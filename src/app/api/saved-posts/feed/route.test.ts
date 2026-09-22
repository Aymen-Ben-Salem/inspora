import { beforeEach, expect, it, vi } from "vitest";
import { auth } from "@clerk/nextjs/server";
import { getDatabase, requireDatabase } from "@/db/client";
import { encodeSavedPostCursor } from "@/data/saved-posts-repository";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(), requireDatabase: vi.fn() }));
const request = (query = "") => new Request("http://localhost/api/saved-posts/feed" + query);
const cursor = (userId: string, category?: "Web") => encodeSavedPostCursor({
  savedAt: "2026-09-01T00:00:00.000Z", id: "11111111-1111-4111-8111-111111111111",
}, { userId, category });
const privateHeader = "private, no-store, max-age=0";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "viewer-a" } as Awaited<ReturnType<typeof auth>>);
  vi.mocked(getDatabase).mockReturnValue(null);
});

it("authenticates before looking at a cursor, which cannot authorize access", async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
  const response = await GET(request("?cursor=" + cursor("viewer-a")));
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe(privateHeader);
  expect(getDatabase).not.toHaveBeenCalled();
});

it.each([
  "?category=unknown",
  "?cursor=bad",
  "?cursor=" + cursor("viewer-b"),
  "?category=Web&cursor=" + cursor("viewer-a"),
  "?cursor=" + Buffer.from(JSON.stringify({ savedAt: "2026-09-01T00:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" })).toString("base64url"),
])("returns a private 400 before selection for %s", async query => {
  const response = await GET(request(query));
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe(privateHeader);
  expect(getDatabase).not.toHaveBeenCalled();
});

it("recovers with a private fresh load and preserves no-database empty pages", async () => {
  expect((await GET(request("?cursor=legacy"))).status).toBe(400);
  for (const query of ["", "?category=Web&cursor=" + cursor("viewer-a", "Web")]) {
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(privateHeader);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  }
});

it("keeps configured failures private and reports unavailable rather than an empty page", async () => {
  vi.mocked(getDatabase).mockReturnValue({} as NonNullable<ReturnType<typeof getDatabase>>);
  vi.mocked(requireDatabase).mockImplementation(() => { throw new Error("configured failure"); });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(privateHeader);
    expect(await response.json()).toEqual({ message: "Could not load more saved posts." });
  } finally { log.mockRestore(); }
});
