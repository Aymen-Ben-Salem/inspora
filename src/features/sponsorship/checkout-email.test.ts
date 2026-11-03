import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser } }) }));
import { verifiedCheckoutEmail } from "./checkout-email";
beforeEach(() => getUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: "Owner@example.com", verification: { status: "verified" } } }));
it("uses the provider's verified primary email, never an arbitrary receipt address", async () => {
  expect(await verifiedCheckoutEmail("user_owner", { company: "Example", contactName: "Owner", email: "owner@example.com" })).toBe("Owner@example.com");
  expect(getUser).toHaveBeenCalledWith("user_owner");
  await expect(verifiedCheckoutEmail("user_owner", { company: "Example", contactName: "Owner", email: "someone-else@example.com" })).rejects.toThrow("verified account email");
});
it.each([null, { emailAddress: "owner@example.com", verification: { status: "unverified" } }])("rejects missing/unverified email", async primaryEmailAddress => {
  getUser.mockResolvedValue({ primaryEmailAddress });
  await expect(verifiedCheckoutEmail("user_owner")).rejects.toThrow("Verify your primary email");
});
