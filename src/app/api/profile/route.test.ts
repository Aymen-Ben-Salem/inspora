import { afterEach, beforeEach, expect, it, vi } from "vitest";

const adapters = vi.hoisted(() => ({ auth: vi.fn(), ensure: vi.fn(), update: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: adapters.auth }));
vi.mock("@/features/creators/identity", () => ({ ensureCreatorForOwner: adapters.ensure }));
vi.mock("@/features/profiles/actions", () => ({ updateOwnProfile: adapters.update }));

import { GET, PATCH } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  adapters.auth.mockResolvedValue({ userId: "trusted-owner" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("uses the authenticated principal and preserves the private profile response", async () => {
  const profile = { id: "creator-id", name: "Ada", username: "ada" };
  adapters.ensure.mockResolvedValue(profile);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(await response.json()).toEqual(profile);
  expect(adapters.ensure).toHaveBeenCalledWith({ userId: "trusted-owner" });
});

it("refuses signed-out profile entry without ensuring an identity", async () => {
  adapters.auth.mockResolvedValue({ userId: null });
  const response = await GET();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "Sign in to view your profile." });
  expect(adapters.ensure).not.toHaveBeenCalled();
});

it.each(["This account is not active.", "DATABASE_URL is not configured."])("preserves the error envelope for %s", async (message) => {
  adapters.ensure.mockRejectedValue(new Error(message));
  const response = await GET();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ message: "Your profile could not be loaded." });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it("preserves profile edit transport errors", async () => {
  const response = await PATCH(new Request("https://example.com/api/profile", { method: "PATCH", body: "invalid json" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ ok: false, field: "form", message: "Invalid profile request." });
  expect(adapters.update).not.toHaveBeenCalled();
});

it("preserves field errors and private headers from owner profile edits", async () => {
  const failure = { ok: false, field: "username", message: "That username is unavailable." };
  adapters.update.mockResolvedValue(failure);
  const response = await PATCH(new Request("https://example.com/api/profile", { method: "PATCH", body: JSON.stringify({ username: "reserved" }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual(failure);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
