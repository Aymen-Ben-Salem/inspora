import { afterEach, describe, expect, it, vi } from "vitest";

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./config", () => ({
  getConfiguredAdminUserIds: () => new Set(["user_admin"]),
  isClerkConfigured: () => true,
}));

import { requireAdmin } from "./require-admin";

describe("requireAdmin", () => {
  afterEach(() => {
    auth.mockReset();
    redirect.mockClear();
  });

  it("sends signed-out admin requests to the isolated /admin entry", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(requireAdmin()).rejects.toThrow("redirect:/admin");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("still rejects a signed-in user outside the admin allowlist", async () => {
    auth.mockResolvedValue({ userId: "user_regular" });

    await expect(requireAdmin()).rejects.toThrow(
      "redirect:/admin-access-denied",
    );
    expect(redirect).toHaveBeenCalledWith("/admin-access-denied");
  });

  it("still allows an allowlisted admin", async () => {
    auth.mockResolvedValue({ userId: "user_admin" });

    await expect(requireAdmin()).resolves.toEqual({ userId: "user_admin" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
