import "server-only";

// MCP-only trial access. This setting is never used to authorize site admins.
export function getConfiguredMcpTrialUserIds(values: Record<string, string | undefined> = process.env) {
  return new Set(
    (values.INSPORA_MCP_TRIAL_USER_IDS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(value => /^user_[A-Za-z0-9]{1,100}$/.test(value)),
  );
}
