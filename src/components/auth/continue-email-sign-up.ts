import type { SignUpResource } from "@clerk/shared/types";

export type EmailSignUpContinuation =
  | { kind: "navigate"; path: "/sign-in/create/verify-email-address" | "/sign-in/create/protect-check" | "/sign-in/create/continue" }
  | { kind: "required-fields" }
  | { kind: "complete"; sessionId: string };

/** Continue the submitted email rather than asking for it again in Clerk's create step. */
export async function continueEmailSignUp(
  signUp: Pick<SignUpResource, "create">,
  emailAddress: string,
): Promise<EmailSignUpContinuation> {
  const result = await signUp.create({ emailAddress });

  if (result.protectCheck) {
    return { kind: "navigate", path: "/sign-in/create/protect-check" };
  }
  if (result.status === "complete" && result.createdSessionId) {
    return { kind: "complete", sessionId: result.createdSessionId };
  }
  if (result.missingFields.length > 0) {
    // Optional fields may be omitted; required fields and consent may not.
    return { kind: "required-fields" };
  }
  if (result.unverifiedFields.includes("email_address")) {
    // Clerk's verification screen owns sending, resending and checking the code.
    return { kind: "navigate", path: "/sign-in/create/verify-email-address" };
  }
  return { kind: "navigate", path: "/sign-in/create/continue" };
}
