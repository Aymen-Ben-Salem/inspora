import { beforeEach, expect, it, vi } from "vitest";
import { cacheLife, cacheTag } from "next/cache";
import { getDatabase } from "@/db/client";
import { getPublishedWebsites } from "../websites-repository";
import { incompletePresentations } from "./testing/completeness";
import { websiteFixture } from "./testing/fixtures";
import { encodePostCursor } from "../post-pagination";
import { GET } from "@/app/api/posts/route";
import { getPostCardsByIds } from "../posts-repository";
import { readWorkPage } from "./index";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(), requireDatabase: vi.fn(() => {
  const database = getDatabase();
  if (!database) throw new Error("DATABASE_URL is not configured.");
  return database;
}) }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2026-09-01T00:00:00Z") }));
const request = { scope: { kind: "website-archive" }, order: "publication-desc" } as const;
const websiteFindMany = vi.fn();
const postFindMany = vi.fn();
const logoFindMany = vi.fn();
const encodeTestCursorPayload = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue({
    query: {
      websites: { findMany: websiteFindMany },
      posts: { findMany: postFindMany },
      logos: { findMany: logoFindMany },
    },
  } as unknown as NonNullable<ReturnType<typeof getDatabase>>);
  websiteFindMany.mockResolvedValue([websiteFixture()]);
  postFindMany.mockResolvedValue([]);
  logoFindMany.mockResolvedValue([]);
});
it("returns usable archive cards and complete-array continuation", async () => {
  const result = await readWorkPage(request);
  expect(result.nextCursor).toBeNull();
  expect(result.items).toMatchObject([{ slug: "paper", recording: { posterUrl: "/poster.webp" }, sections: [{ url: "/hero.webp" }] }]);
  expect(await getPublishedWebsites()).toEqual(result.items);
});
it("fails the whole read when a selected presentation becomes inconsistent", async () => {
  const incomplete = websiteFixture();
  incomplete.sections = [];
  websiteFindMany.mockResolvedValue([websiteFixture(), incomplete]);
  await expect(readWorkPage(request)).rejects.toThrow(/incomplete/);
  await expect(getPublishedWebsites()).rejects.toThrow(/incomplete/);
});
it("owns work and creator cache dependencies with the existing lifetime", async () => {
  await getPublishedWebsites();
  expect(cacheLife).toHaveBeenCalledExactlyOnceWith({ stale: 300, revalidate: 21600, expire: 604800 });
  expect(cacheTag).toHaveBeenCalledWith("published-websites", "public-creator-profiles");
});
it("only the adapter falls back for explicit no-database configuration", async () => {
  vi.mocked(getDatabase).mockReturnValue(null);
  expect(await getPublishedWebsites()).toEqual([]);
  await expect(readWorkPage(request)).rejects.toThrow(/not configured/);
});
it("propagates configuration and query failures", async () => {
  websiteFindMany.mockRejectedValueOnce(new Error("query failed"));
  await expect(getPublishedWebsites()).rejects.toThrow("query failed");
  vi.mocked(getDatabase).mockImplementationOnce(() => { throw new Error("wrong environment"); });
  await expect(getPublishedWebsites()).rejects.toThrow("wrong environment");
});
it.each([
  { ...request, scope: { kind: "creator", creatorId: "other" } },
  { ...request, order: "created-desc" },
  { ...request, filters: { category: "Web" } },
  { ...request, filters: { view: "unknown" } },
  { ...request, cursor: "legacy-or-malformed" },
  { ...request, limit: 16 },
])("rejects unsupported requests before selection: %j", async (invalid) => {
  await expect(readWorkPage(invalid as typeof request)).rejects.toThrow(/Unsupported/);
  expect(websiteFindMany).not.toHaveBeenCalled();
});

it("does not truncate a complete archive to a browser page", async () => {
  websiteFindMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({ ...websiteFixture(), id: String(i) })));
  expect((await getPublishedWebsites()).length).toBe(40);
});
it("propagates mapper errors instead of returning partial cards", async () => {
  const row = websiteFixture();
  row.media.push({ ...row.media[1], role: "unsupported" });
  websiteFindMany.mockResolvedValue([row]);
  await expect(readWorkPage(request)).rejects.toThrow("Unsupported website media role");
});

it.each(incompletePresentations)("fails selected incomplete presentation: $name", async ({ change }) => {
  const row = websiteFixture();
  change(row);
  websiteFindMany.mockResolvedValue([row]);
  await expect(readWorkPage(request)).rejects.toThrow(/incomplete/);
});
it.each([null, new Date("2026-09-01T00:00:00.001Z")])("fails inconsistent selected publication time %s", async publishedAt => {
  websiteFindMany.mockResolvedValue([{ ...websiteFixture(), publishedAt }]);
  await expect(readWorkPage(request)).rejects.toThrow(/inconsistent/);
});
it.each([false, 0, "", {}])("does not impose preview shape validation: %j", async preview => {
  const row = websiteFixture();
  row.media[0].videoPreview = preview as unknown as NonNullable<typeof row.media[0]["videoPreview"]>;
  websiteFindMany.mockResolvedValue([row]);
  expect((await readWorkPage(request)).items[0].recording.videoPreview).toEqual(preview);
});

it("pages design cards with a versioned cursor bound to scope, filter, and order", async () => {
  const createdAt = new Date("2026-08-31T00:00:00.000Z");
  const designRows = Array.from({ length: 17 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(17 - index).padStart(12, "0")}`,
    slug: `design-${index}`,
    title: `Design ${index}`,
    status: "published",
    publishedAt: createdAt,
    createdAt,
    category: "Web",
    isFeatured: true,
    creator: {
      name: "Studio",
      username: "studio",
      avatarUrl: "/avatar.svg",
      avatarStorageProvider: null,
    },
    media: [{
      id: `media-${index}`,
      type: "image",
      url: `/design-${index}.webp`,
      posterUrl: null,
      storageProvider: null,
      variants: [],
      videoPreview: null,
      alt: `Design ${index}`,
      width: 1200,
      height: 900,
    }],
    mediaCount: 1,
  }));
  postFindMany.mockResolvedValueOnce(designRows);
  const designRequest = {
    scope: { kind: "design-archive" },
    filters: { category: "Web", view: "featured" },
    order: "created-desc",
  } as const;

  const first = await readWorkPage(designRequest);

  expect(first.items).toHaveLength(16);
  expect(first.items[0]).toMatchObject({ id: designRows[0].id, mediaCount: 1 });
  expect(first.nextCursor).toEqual(expect.any(String));

  postFindMany.mockResolvedValueOnce(designRows.slice(0, 16));
  expect(await getPostCardsByIds(first.items.map(item => item.id))).toEqual(first.items);

  postFindMany.mockClear();
  await expect(readWorkPage({
    ...designRequest,
    filters: { category: "Branding", view: "featured" },
    cursor: first.nextCursor,
  })).rejects.toThrow(/cursor/i);
  expect(postFindMany).not.toHaveBeenCalled();
});

it("returns the complete logo and app-icon archive without truncation", async () => {
  const createdAt = new Date("2026-08-30T00:00:00.000Z");
  const logoRows = Array.from({ length: 20 }, (_, index) => ({
    id: `logo-${index}`,
    slug: `logo-${index}`,
    title: `Logo ${index}`,
    kind: index === 0 ? "icon" : "logo",
    creatorId: "creator",
    description: "Identity",
    industry: "Design",
    colors: [],
    styles: [],
    shape: "Symbol",
    sourceUrl: "https://example.com",
    status: "published",
    publishedAt: createdAt,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt,
    updatedAt: createdAt,
    creator: {
      id: "creator",
      name: "Studio",
      username: "studio",
      handle: null,
      url: null,
      xProfileUrl: null,
      xProviderId: null,
      ownerUserId: null,
      editedFields: [],
      recordOrigin: "mirrored",
      avatarUrl: "/avatar.svg",
      avatarStorageProvider: null,
      avatarStorageKey: null,
      createdAt,
      updatedAt: createdAt,
    },
    media: [{
      id: `media-${index}`,
      logoId: `logo-${index}`,
      url: `/logo-${index}.webp`,
      storageProvider: null,
      storageKey: null,
      mimeType: "image/webp",
      sourceMimeType: "image/png",
      sizeBytes: 100,
      variants: [],
      alt: `Logo ${index}`,
      width: 100,
      height: 100,
      createdAt,
    }],
  }));
  logoFindMany.mockResolvedValue(logoRows);

  const page = await readWorkPage({
    scope: { kind: "logo-archive" },
    order: "created-desc",
  });

  expect(page.items).toHaveLength(20);
  expect(page.items[0]).toMatchObject({ kind: "icon", media: { url: "/logo-0.webp" } });
  expect(page.nextCursor).toBeNull();

  logoFindMany.mockResolvedValue([{ ...logoRows[0], kind: "mark" }]);
  await expect(readWorkPage({
    scope: { kind: "logo-archive" },
    order: "created-desc",
  })).rejects.toThrow("Unsupported logo kind");

  logoFindMany.mockResolvedValue([{ ...logoRows[0], media: [] }]);
  await expect(readWorkPage({
    scope: { kind: "logo-archive" },
    order: "created-desc",
  })).rejects.toThrow("has no media");
});

it("owns design and logo cache dependencies with the existing lifetime", async () => {
  await readWorkPage({ scope: { kind: "design-archive" }, order: "created-desc" });
  expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
    stale: 300,
    revalidate: 21600,
    expire: 604800,
  });
  expect(cacheTag).toHaveBeenCalledWith("published-posts", "public-creator-profiles");

  vi.clearAllMocks();
  logoFindMany.mockResolvedValue([]);
  await readWorkPage({ scope: { kind: "logo-archive" }, order: "created-desc" });
  expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
    stale: 300,
    revalidate: 21600,
    expire: 604800,
  });
  expect(cacheTag).toHaveBeenCalledWith("published-logos", "public-creator-profiles");
});

it.each([
  ["malformed", "not-a-cursor"],
  ["unsupported version", encodeTestCursorPayload({
    v: 2,
    scope: { kind: "design-archive" },
    filters: { category: null, view: "latest" },
    order: "created-desc",
    keys: { createdAt: "2026-08-01T00:00:00.000Z", id: "design" },
  })],
  ["scope mismatch", encodeTestCursorPayload({
    v: 1,
    scope: { kind: "saved" },
    filters: { category: null, view: "latest" },
    order: "created-desc",
    keys: { createdAt: "2026-08-01T00:00:00.000Z", id: "design" },
  })],
  ["filter mismatch", encodeTestCursorPayload({
    v: 1,
    scope: { kind: "design-archive" },
    filters: { category: "Web", view: "latest" },
    order: "created-desc",
    keys: { createdAt: "2026-08-01T00:00:00.000Z", id: "design" },
  })],
  ["order mismatch", encodeTestCursorPayload({
    v: 1,
    scope: { kind: "design-archive" },
    filters: { category: null, view: "latest" },
    order: "publication-desc",
    keys: { createdAt: "2026-08-01T00:00:00.000Z", id: "design" },
  })],
  ["unbound legacy", encodeTestCursorPayload({
    createdAt: "2026-08-01T00:00:00.000Z",
    id: "design",
  })],
])("rejects %s design cursors before selection", async (_name, cursor) => {
  await expect(readWorkPage({
    scope: { kind: "design-archive" },
    order: "created-desc",
    cursor,
  })).rejects.toThrow(/cursor/i);
  expect(postFindMany).not.toHaveBeenCalled();
});

it("recovers from a rejected legacy cursor on a normal cursor-free load", async () => {
  const legacy = encodeTestCursorPayload({
    createdAt: "2026-08-01T00:00:00.000Z",
    id: "design",
  });
  await expect(readWorkPage({
    scope: { kind: "design-archive" },
    order: "created-desc",
    cursor: legacy,
  })).rejects.toThrow(/cursor/i);

  await expect(readWorkPage({
    scope: { kind: "design-archive" },
    order: "created-desc",
  })).resolves.toEqual({ items: [], nextCursor: null });
});

it.each(["not-a-uuid", "x", "00000000-0000-0000-0000-00000000000z"])("rejects malformed persisted ID %s before selection and preserves HTTP 400", async id => {
  const cursor = encodeTestCursorPayload({
    v: 1, scope: { kind: "design-archive" },
    filters: { category: null, view: "latest" }, order: "created-desc",
    keys: { createdAt: "2026-08-01T00:00:00.000Z", id },
  });
  await expect(readWorkPage({ scope: { kind: "design-archive" }, order: "created-desc", cursor }))
    .rejects.toThrow("Invalid public-work cursor");
  const response = await GET(new Request(`http://localhost/api/posts?cursor=${cursor}`));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ message: "Invalid pagination cursor." });
  expect(postFindMany).not.toHaveBeenCalled();
});

it("keeps development-seed continuation working through the HTTP route", async () => {
  vi.mocked(getDatabase).mockReturnValue(null);
  const first = await GET(new Request("http://localhost/api/posts"));
  const page = await first.json();
  const cursor = encodePostCursor({ id: page.items[0].id, createdAt: page.items[0].createdAt });
  const second = await GET(new Request(`http://localhost/api/posts?cursor=${cursor}`));
  expect(second.status).toBe(200);
  const next = await second.json();
  expect(next.items.length).toBeGreaterThan(0);
  expect(next.items).toEqual(page.items.slice(1));
  expect(postFindMany).not.toHaveBeenCalled();
});
