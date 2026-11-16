import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getConfiguredMcpTrialUserIds } from "./mcp-trial-access";
import { getConfiguredAdminUserIds } from "@/auth/config";
afterEach(() => vi.unstubAllEnvs());

it("accepts exact Clerk IDs only and never changes the website admin allowlist", () => {
  vi.stubEnv("ADMIN_USER_IDS", "user_admin"); vi.stubEnv("ADMIN_ADDITIONAL_USER_IDS", "");
  vi.stubEnv("INSPORA_MCP_TRIAL_USER_IDS", " user_tester,user_tester,anyone,test@example.com,user_REPLACE_ME,user_admin ");
  expect([...getConfiguredMcpTrialUserIds()]).toEqual(["user_tester", "user_admin"]);
  expect([...getConfiguredAdminUserIds()]).toEqual(["user_admin"]);
  expect([...getConfiguredMcpTrialUserIds({})]).toEqual([]);
});
