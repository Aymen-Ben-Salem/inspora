import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { prepareProIdentity } from "./server";

const clerk = vi.hoisted(() => ({ updateUser: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: clerk.client }));

beforeEach(() => {
  clerk.updateUser.mockReset().mockResolvedValue({ id: "user_proBuyer", deleteSelfEnabled: false });
  clerk.client.mockReset().mockResolvedValue({ users: { updateUser: clerk.updateUser } });
  vi.stubEnv("INSPORA_PRO_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

it("disables only Clerk Frontend self deletion for the authenticated Pro buyer", async () => {
  await prepareProIdentity("user_proBuyer");
  expect(clerk.updateUser).toHaveBeenCalledExactlyOnceWith("user_proBuyer", { deleteSelfEnabled: false });
});

it("fails closed if Clerk does not confirm the safeguard", async () => {
  clerk.updateUser.mockResolvedValue({ id: "user_proBuyer", deleteSelfEnabled: true });
  await expect(prepareProIdentity("user_proBuyer")).rejects.toThrow("deletion safeguard");
});

it("preserves the default disabled feature without contacting Clerk", async () => {
  vi.stubEnv("INSPORA_PRO_ENABLED", "false");
  await expect(prepareProIdentity("user_proBuyer")).rejects.toThrow("unavailable");
  expect(clerk.client).not.toHaveBeenCalled();
  expect(clerk.updateUser).not.toHaveBeenCalled();
});
