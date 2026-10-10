import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { PostCardData } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";
vi.mock("./post-card", () => ({
  PostCard: ({ post }: { post: { id: string } }) => (
    <a href={`/posts/${post.id}`}>{post.id}</a>
  ),
}));
vi.mock("./feed-motion", () => ({
  FeedMotion: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
import { PostFeed } from "./post-feed";
const paid: ActiveSponsor[] = ["A", "B", "C", "D"].map((id) => ({
  id,
  title: `Sponsor ${id}`,
  url: `https://${id.toLowerCase()}.example.invalid`,
  mediaType: "image",
  mediaWidth: 1200,
  mediaHeight: 800,
  mediaAlt: id,
  paidThrough: "2026-11-09T12:00:00Z",
  serverTime: "2026-10-10T12:00:00Z",
}));
it.each([0, 3, 8])(
  "shows each paid campaign once with %i ordinary designs while preserving their order",
  (count) => {
    const posts = Array.from(
      { length: count },
      (_, i) => ({ id: String(i) }) as PostCardData,
    );
    const html = renderToStaticMarkup(
      <PostFeed posts={posts} sponsors={paid} />,
    );
    for (const s of paid)
      expect(
        html.match(new RegExp(`aria-label="Sponsored: ${s.title}"`, "g")),
      ).toHaveLength(1);
    expect(
      [...html.matchAll(/href="\/posts\/(\d+)"/g)].map((m) => m[1]),
    ).toEqual(posts.map((p) => p.id));
  },
);
