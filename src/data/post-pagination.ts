import type { Post, PostCategory, PostView } from "@/domain/post";

export const POST_PAGE_SIZE = 18;
export const MAX_POST_PAGE_SIZE = 48;

export type PostCursor = {
  createdAt: string;
  id: string;
};

export type PostPage = {
  items: Post[];
  nextCursor: string | null;
};

type PostPageOptions = {
  category?: PostCategory;
  view?: PostView;
  cursor?: string | null;
  limit?: number;
};

function isPostCursor(value: unknown): value is PostCursor {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 128
  );
}

export function encodePostCursor(cursor: PostCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePostCursor(value: string): PostCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return isPostCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function comparePostPosition(
  left: Pick<Post, "id" | "createdAt">,
  right: Pick<Post, "id" | "createdAt">,
) {
  const createdAtDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdAtDifference !== 0) return createdAtDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

export function paginatePostArray(
  posts: Post[],
  { category, view = "latest", cursor, limit = POST_PAGE_SIZE }: PostPageOptions = {},
): PostPage {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_POST_PAGE_SIZE));
  const decodedCursor = cursor ? decodePostCursor(cursor) : null;

  if (cursor && !decodedCursor) throw new Error("Invalid post cursor.");

  const orderedPosts = posts
    .filter(
      (post) =>
        (!category || post.category === category) &&
        (view !== "featured" || post.isFeatured),
    )
    .sort(comparePostPosition);
  const remainingPosts = decodedCursor
    ? orderedPosts.filter((post) => comparePostPosition(post, decodedCursor) > 0)
    : orderedPosts;
  const candidates = remainingPosts.slice(0, boundedLimit + 1);
  const items = candidates.slice(0, boundedLimit);
  const finalPost = items.at(-1);

  return {
    items,
    nextCursor:
      candidates.length > boundedLimit && finalPost
        ? encodePostCursor({
            createdAt: finalPost.createdAt,
            id: finalPost.id,
          })
        : null,
  };
}
