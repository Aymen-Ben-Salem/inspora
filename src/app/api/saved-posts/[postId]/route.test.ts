import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  savePostForUser,
  unsavePostForUser,
  SavedPostUnavailableError,
} = vi.hoisted(() => {
  class HoistedSavedPostUnavailableError extends Error {}
  return {
    auth: vi.fn(),
    savePostForUser: vi.fn(),
    unsavePostForUser: vi.fn(),
    SavedPostUnavailableError: HoistedSavedPostUnavailableError,
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/data/saved-posts-repository", () => ({
  savePostForUser,
  unsavePostForUser,
  SavedPostUnavailableError,
}));

import { DELETE, POST } from "./route";

const postId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ postId }) };

describe("/api/saved-posts/[postId]", () => {
  beforeEach(() => {
    auth.mockReset();
    auth.mockResolvedValue({ userId: "user_alpha" });
    savePostForUser.mockReset();
    unsavePostForUser.mockReset();
  });

  it("saves and removes only for the authenticated account", async () => {
    const saved = await POST(new Request("http://localhost"), context);
    const removed = await DELETE(new Request("http://localhost"), context);

    expect(saved.status).toBe(200);
    expect(removed.status).toBe(200);
    expect(savePostForUser).toHaveBeenCalledWith("user_alpha", postId);
    expect(unsavePostForUser).toHaveBeenCalledWith("user_alpha", postId);
    expect(saved.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("does not mutate data for signed-out users", async () => {
    auth.mockResolvedValue({ userId: null });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(401);
    expect(savePostForUser).not.toHaveBeenCalled();
  });
});
