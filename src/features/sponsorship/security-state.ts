export type SponsorSecurityState =
  | "signed_out"
  | "email_required"
  | "setup_required"
  | "verification_required"
  | "ready";

export function hasSponsorSecondFactor(age: unknown): boolean {
  return (
    Array.isArray(age) &&
    age.length === 2 &&
    [age[0], age[1]].every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
  );
}
