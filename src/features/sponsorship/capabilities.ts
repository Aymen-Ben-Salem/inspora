import type { AccountCapabilities } from "./types";
export function sponsorAccountCanWrite(state: string | null) {
  return state === null || state === "active" || state === "recovery";
}
export function accountCapabilities(input: {
  profile: string | null;
  identity: string | null;
  account: string | null;
}): AccountCapabilities {
  const denied =
    ["revoked", "deleting"].includes(input.identity ?? "") ||
    ["revoked", "deleting"].includes(input.account ?? "");
  return {
    viewer: input.profile === "active",
    sponsor:
      !denied && (input.identity === "allowed" || input.account !== null),
    sponsorReadonly: !denied && input.account === "inactive",
  };
}
