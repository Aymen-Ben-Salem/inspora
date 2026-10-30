import { afterEach, beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireDatabase: vi.fn(),
  withWriteTransaction: vi.fn(),
  verifyStorage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/storage/r2", async (original) => ({ ...await original<typeof import("@/storage/r2")>(), assertR2StorageKeysExist: external.verifyStorage }));
vi.mock("./x-api", () => ({ lookupXProfile: vi.fn(async () => ({ id: "123456789", username: "studio_one" })), XLookupError: class extends Error {} }));
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
  saveAdminCreatorForAttribution,
  updateAdminCreator,
} from "./identity";
import type { AdminCreatorInput } from "./types";
import type { creators } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { lookupXProfile, XLookupError } from "./x-api";

const input: AdminCreatorInput = {
  name: "Studio One",
  username: "studio_one",
  avatarUrl: "/avatar.svg",
};

beforeEach(() => {
  vi.resetAllMocks();
  external.requireAdmin.mockRejectedValue(new Error("redirect:/admin-access-denied"));
});
afterEach(() => vi.unstubAllEnvs());

function creatorTransaction(overrides: Partial<typeof creators.$inferSelect> = {}) {
  const existing: typeof creators.$inferSelect = {
    id: "11111111-1111-4111-8111-111111111111",
    name: input.name,
    username: input.username!,
    avatarUrl: input.avatarUrl,
    avatarStorageProvider: null,
    avatarStorageKey: null,
    trashedAt: null,
    handle: null,
    url: null,
    xProfileUrl: null,
    xProviderId: null,
    xProfileAccountId: null,
    ownerUserId: "admin",
    recordOrigin: "user",
    editedFields: [],
    createdAt: new Date("2026-10-28T00:00:00Z"),
    updatedAt: new Date("2026-10-28T00:00:00Z"),
    ...overrides,
  };
  const set = vi.fn((values: Partial<typeof existing>) => ({
    where: vi.fn(() => ({ returning: async () => [{ ...existing, ...values }] })),
  }));
  const audit = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({ from: () => ({ where: () => ({
      for: async () => [existing],
      limit: async () => [],
    }) }) })),
    update: vi.fn(() => ({ set })),
    insert: vi.fn(() => ({ values: audit })),
  };
  external.requireAdmin.mockResolvedValue({ userId: "admin" });
  external.withWriteTransaction.mockImplementation(
    async (work: (tx: WriteTx) => Promise<unknown>) => work(transaction as unknown as WriteTx),
  );
  return { existing, set, audit, transaction: transaction as unknown as WriteTx };
}

it.each([
  { previous: null, next: "https://twitter.com/Studio_One", expected: "https://x.com/studio_one" },
  { previous: "https://x.com/old_studio", next: "https://x.com/studio_one", expected: "https://x.com/studio_one" },
  { previous: "https://x.com/old_studio", next: "", expected: null },
])("allows an admin owner to edit an unverified public X link: $previous -> $expected", async ({ previous, next, expected }) => {
  const { existing, set, audit } = creatorTransaction({ xProfileUrl: previous });
  await expect(updateAdminCreator(existing.id, { ...input, xProfileUrl: next })).resolves.toMatchObject({
    creator: { ownerUserId: "admin", xProviderId: undefined, xProfileUrl: expected ?? undefined },
  });
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ xProfileUrl: expected, xProfileAccountId: expected ? "123456789" : null }));
  const values = set.mock.calls[0][0];
  expect(values).not.toHaveProperty("ownerUserId");
  expect(values).not.toHaveProperty("xProviderId");
  expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin", action: "creator.updated" }));
});

it.each([null, "another-owner"])("allows an admin to edit an unverified public X link with owner %s", async (ownerUserId) => {
  const { existing } = creatorTransaction({ ownerUserId });
  await expect(updateAdminCreator(existing.id, { ...input, xProfileUrl: "https://x.com/studio_one" })).resolves.toMatchObject({
    creator: { ownerUserId: ownerUserId ?? undefined, xProviderId: undefined, xProfileUrl: "https://x.com/studio_one" },
  });
});

it.each([
  { ownerUserId: "admin", previous: "https://x.com/studio_one", next: "https://x.com/another" },
  { ownerUserId: "admin", previous: "https://x.com/studio_one", next: "" },
  { ownerUserId: null, previous: "https://x.com/studio_one", next: "https://x.com/another" },
  { ownerUserId: "admin", previous: null, next: "https://x.com/another" },
])("protects a verified X identity from manual URL changes (%#)", async ({ ownerUserId, previous, next }) => {
  const { existing, set, audit } = creatorTransaction({ ownerUserId, xProviderId: "verified-provider", xProfileUrl: previous });
  await expect(updateAdminCreator(existing.id, { ...input, xProfileUrl: next })).rejects.toMatchObject({
    code: "conflict",
    message: "This link belongs to a verified X identity. To change it, the creator must update their connected X account.",
  });
  expect(set).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it("allows other profile edits while preserving the verified X identity", async () => {
  const { existing, set } = creatorTransaction({ xProviderId: "verified-provider", xProfileUrl: "https://x.com/studio_one" });
  await expect(updateAdminCreator(existing.id, { ...input, name: "Updated studio", xProfileUrl: "https://twitter.com/Studio_One/" })).resolves.toMatchObject({
    creator: { name: "Updated studio", ownerUserId: "admin", xProviderId: "verified-provider", xProfileUrl: "https://x.com/studio_one" },
  });
  expect(set.mock.calls[0][0]).not.toHaveProperty("xProviderId");
  expect(lookupXProfile).not.toHaveBeenCalled();
});

it("preserves a pinned editorial X identity without resolving the username again", async () => {
  const { existing, set } = creatorTransaction({ xProfileAccountId: "original-account", xProfileUrl: "https://x.com/studio_one" });
  await updateAdminCreator(existing.id, { ...input, xProfileUrl: "https://x.com/studio_one" });
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ xProfileAccountId: "original-account" }));
  expect(lookupXProfile).not.toHaveBeenCalled();
});

it("rejects unavailable official verification without changing an admin-edited creator", async () => {
  const { existing, set } = creatorTransaction();
  vi.mocked(lookupXProfile).mockRejectedValueOnce(new XLookupError("unavailable", "X is unavailable"));
  await expect(updateAdminCreator(existing.id, { ...input, xProfileUrl: "https://x.com/studio_one" })).rejects.toMatchObject({ code: "invalid_input" });
  expect(set).not.toHaveBeenCalled();
});

it("allows public X link edits through inline work attribution without changing ownership", async () => {
  const { existing, set, transaction } = creatorTransaction({ recordOrigin: "preview" });
  await expect(saveAdminCreatorForAttribution(transaction, { userId: "admin" }, {
    ...input, id: existing.id, xProfileUrl: "https://x.com/studio_one",
  })).resolves.toMatchObject({ creatorId: existing.id });
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ xProfileUrl: "https://x.com/studio_one" }));
  expect(set.mock.calls[0][0]).not.toHaveProperty("ownerUserId");
  expect(set.mock.calls[0][0]).not.toHaveProperty("xProviderId");
});

it("protects verified X identities through inline work attribution", async () => {
  const { existing, set, transaction } = creatorTransaction({ recordOrigin: "preview", xProviderId: "verified-provider", xProfileUrl: "https://x.com/studio_one" });
  await expect(saveAdminCreatorForAttribution(transaction, { userId: "admin" }, {
    ...input, id: existing.id, xProfileUrl: "https://x.com/another",
  })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("verified X identity") });
  expect(set).not.toHaveBeenCalled();
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

it("rejects direct permanent deletion of an active creator before touching their data", async () => {
  const { existing, audit } = creatorTransaction({ ownerUserId: null, recordOrigin: "preview" });
  await expect(deleteAdminCreator(existing.id)).rejects.toMatchObject({ code: "conflict", message: "Move this creator to Trash before deleting them permanently." });
  expect(audit).not.toHaveBeenCalled();
});

it("checks reused avatar URLs without storage metadata before allowing an admin update", async () => {
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example/public");
  const avatarUrl = "https://media.example/public/creators/shared.webp";
  const { existing, set, transaction } = creatorTransaction({ avatarUrl });
  external.verifyStorage.mockRejectedValueOnce(new Error("missing media"));
  await expect(updateAdminCreator(existing.id, { ...input, avatarUrl })).rejects.toMatchObject({ code: "database_unavailable" });
  expect(transaction.execute).toHaveBeenCalledOnce();
  expect(external.verifyStorage).toHaveBeenCalledWith(["creators/shared.webp"]);
  expect(set).not.toHaveBeenCalled();
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
