import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const adapters = vi.hoisted(() => ({
  auth: vi.fn(),
  capabilities: vi.fn(),
  begin: vi.fn(),
  account: vi.fn(),
  security: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: adapters.auth }));
vi.mock("@/features/sponsorship/security", () => ({ readSponsorSecurity: adapters.security }));
vi.mock("@/auth/config", () => ({ isClerkConfigured: () => true }));
vi.mock("@/features/sponsorship/authorization", () => ({
  readAccountCapabilities: adapters.capabilities,
}));
vi.mock("@/features/sponsorship/service", () => ({
  beginSponsorPreparation: adapters.begin,
}));
vi.mock("@/features/sponsorship/repository", () => ({
  readSponsorAccountForOwner: adapters.account,
}));
import { GET } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  adapters.auth.mockResolvedValue({ userId: "verified-owner" });
  adapters.security.mockResolvedValue({ state: "ready", userId: "verified-owner" });
  adapters.begin.mockResolvedValue({ ok: true, value: { id: "preparation" } });
  adapters.account.mockResolvedValue(null);
  adapters.capabilities.mockResolvedValue({ sponsor: true });
});
it.each(["setup_required", "verification_required", "email_required"])("requires security before returning to a paid account: %s", async state => {
  adapters.account.mockResolvedValue({ state: "active" });
  adapters.security.mockResolvedValue({ state, userId: "verified-owner" });
  const response = await GET(new Request("https://preview.example/api/sponsorship/verify?return_path=https://foreign.example"));
  expect(response.headers.get("location")).toBe("https://preview.example/sponsor/security");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(adapters.begin).not.toHaveBeenCalled();
  expect(adapters.account).not.toHaveBeenCalled();
});
it("binds the verified owner before the fixed callback and clears one-use flow intent", async () => {
  const response = await GET(
    new Request(
      "https://preview.example/api/sponsorship/verify?return_path=https://foreign.example",
    ),
  );
  expect(adapters.capabilities).toHaveBeenCalledWith("verified-owner");
  expect(response.headers.get("location")).toBe(
    "https://preview.example/sponsor/start",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("inspora_sponsor_flow=");
});
it("never treats an unverified callback as a successful preparation", async () => {
  adapters.begin.mockResolvedValue({
    ok: false,
    code: "unauthenticated",
    message: "Verify access.",
  });
  const response = await GET(
    new Request("https://preview.example/api/sponsorship/verify"),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("location")).toBeNull();
});
it.each(["active", "recovery", "inactive"])(
  "returns a %s sponsor to billing without trying to create an unpaid preparation",
  async (state) => {
    adapters.account.mockResolvedValue({
      accountId: "owned",
      userId: "verified-owner",
      state,
    });
    const response = await GET(
      new Request("https://preview.example/api/sponsorship/verify"),
    );
    expect(response.headers.get("location")).toBe(
      "https://preview.example/sponsor/dashboard",
    );
    expect(adapters.begin).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  },
);
