import { afterEach, describe, expect, it, vi } from "vitest";

const { auth, redirect, adminIds, accessConfigured } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
  adminIds: new Set(["user_admin"]),
  accessConfigured: vi.fn(() => true),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/auth/config", () => ({
  getConfiguredAdminUserIds: () => adminIds,
  isAdminAccessConfigured: () => accessConfigured(),
}));

import AdminPage from "./page";

describe("admin entry page", () => {
  afterEach(() => {
    auth.mockReset();
    redirect.mockReset();
    accessConfigured.mockReturnValue(true);
  });

  it("stays on /admin so a signed-out visitor sees the admin sign-in", async () => {
    auth.mockResolvedValue({ userId: null });

    await AdminPage();

    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not send a regular user into the admin application", async () => {
    auth.mockResolvedValue({ userId: "user_regular" });

    await AdminPage();

    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends an allowlisted admin to the existing admin home", async () => {
    auth.mockResolvedValue({ userId: "user_admin" });

    await AdminPage();

    expect(redirect).toHaveBeenCalledWith("/admin/posts");
  });
});
