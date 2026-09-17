import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getSavedPostIdsForUser } = vi.hoisted(() => ({
  auth: vi.fn(),
  getSavedPostIdsForUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/data/saved-posts-repository", () => ({
  getSavedPostIdsForUser,
  MAX_SAVED_STATUS_IDS: 100,
}));

import { GET } from "./route";

const postId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/saved-posts", () => {
  beforeEach(() => {
    auth.mockReset();
    getSavedPostIdsForUser.mockReset();
  });

  it("keeps account data private and scopes lookup to the signed-in user", async () => {
    auth.mockResolvedValue({ userId: "user_alpha" });
    getSavedPostIdsForUser.mockResolvedValue([postId]);

    const response = await GET(
      new Request(`http://localhost/api/saved-posts?id=${postId}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(getSavedPostIdsForUser).toHaveBeenCalledWith("user_alpha", [postId]);
    await expect(response.json()).resolves.toEqual({ savedPostIds: [postId] });
  });

  it("rejects signed-out and malformed requests", async () => {
    auth.mockResolvedValueOnce({ userId: null });
    const signedOut = await GET(
      new Request(`http://localhost/api/saved-posts?id=${postId}`),
    );
    expect(signedOut.status).toBe(401);

    auth.mockResolvedValueOnce({ userId: "user_alpha" });
    const malformed = await GET(
      new Request("http://localhost/api/saved-posts?id=not-a-uuid"),
    );
    expect(malformed.status).toBe(400);
    expect(getSavedPostIdsForUser).not.toHaveBeenCalled();
  });
});
