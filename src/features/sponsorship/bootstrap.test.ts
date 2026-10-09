import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const adapters = vi.hoisted(() => ({
  state: vi.fn(),
  bind: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("./repository", () => ({
  readIdentityCapabilities: adapters.state,
  bindSponsorIdentity: adapters.bind,
}));
vi.mock("./onboarding", () => ({ hasSponsorIntent: adapters.intent }));
import { readAccountCapabilities } from "./authorization";
beforeEach(() => {
  vi.clearAllMocks();
  adapters.state.mockResolvedValue({
    profile: null,
    identity: null,
    account: null,
  });
  adapters.intent.mockResolvedValue(true);
});
it("preserves signed sponsor intent at the first callback when the feature is disabled", async () => {
  vi.stubEnv("SPONSORSHIP_ENABLED", "false");
  try {
    expect(await readAccountCapabilities("verified-owner")).toMatchObject({
      viewer: false,
      sponsor: true,
    });
    expect(adapters.bind).toHaveBeenCalledWith("verified-owner");
  } finally {
    vi.unstubAllEnvs();
  }
});
