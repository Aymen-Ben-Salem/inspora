import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireDatabase: vi.fn(),
  withWriteTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({
  requireAdmin: external.requireAdmin,
}));
vi.mock("@/db/client", () => ({
  requireDatabase: external.requireDatabase,
}));
vi.mock("@/db/write-client", () => ({
  withWriteTransaction: external.withWriteTransaction,
}));

import {
  AdminCreatorMutationError,
  createAdminCreator,
  deleteAdminCreator,
  getAdminCreatorClaims,
  getAdminCreators,
  updateAdminCreator,
} from "./identity";
import type { AdminCreatorInput } from "./types";

const input: AdminCreatorInput = {
  name: "Studio One",
  username: "studio_one",
  avatarUrl: "/avatar.svg",
};

beforeEach(() => {
  vi.clearAllMocks();
  external.requireAdmin.mockRejectedValue(new Error("redirect:/admin-access-denied"));
});

it("establishes admin authority before standalone creator reads and writes", async () => {
  await expect(getAdminCreators()).rejects.toThrow("admin-access-denied");
  await expect(getAdminCreatorClaims()).rejects.toThrow("admin-access-denied");
  await expect(createAdminCreator(input)).rejects.toThrow("admin-access-denied");
  await expect(
    updateAdminCreator("11111111-1111-4111-8111-111111111111", input),
  ).rejects.toThrow("admin-access-denied");
  await expect(
    deleteAdminCreator("11111111-1111-4111-8111-111111111111"),
  ).rejects.toThrow("admin-access-denied");

  expect(external.requireAdmin).toHaveBeenCalledTimes(5);
  expect(external.requireDatabase).not.toHaveBeenCalled();
  expect(external.withWriteTransaction).not.toHaveBeenCalled();
});

it("reports unavailable writes distinctly", async () => {
  external.requireAdmin.mockResolvedValue({ userId: "admin" });
  await expect(
    createAdminCreator({ ...input, xProfileUrl: "https://example.com/not-x" }),
  ).rejects.toMatchObject({
    code: "invalid_input",
    message: expect.stringContaining("X profile"),
  });
  expect(external.withWriteTransaction).not.toHaveBeenCalled();

  external.withWriteTransaction.mockRejectedValueOnce(
    new Error("connection unavailable"),
  );

  await expect(createAdminCreator(input)).rejects.toEqual(
    expect.objectContaining({
      name: AdminCreatorMutationError.name,
      code: "database_unavailable",
    }),
  );
});
