import type { SignUpResource } from "@clerk/shared/types";
import { describe, expect, it, vi } from "vitest";
import { continueEmailSignUp } from "./continue-email-sign-up";

function resource(overrides: Partial<SignUpResource> = {}) {
  return {
    status: "missing_requirements", missingFields: [],
    optionalFields: ["first_name", "last_name"], unverifiedFields: ["email_address"],
    protectCheck: null, createdSessionId: null, ...overrides,
  } as SignUpResource;
}

describe("public new-email continuation", () => {
  it("submits the transferred email once and skips optional details to verification", async () => {
    const create = vi.fn().mockResolvedValue(resource());
    expect(await continueEmailSignUp({ create }, "new@example.com")).toEqual({
      kind: "navigate", path: "/sign-in/create/verify-email-address",
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({ emailAddress: "new@example.com" });
  });

  it("leaves required fields and consent to Clerk", async () => {
    const create = vi.fn().mockResolvedValue(resource({ missingFields: ["legal_accepted"] }));
    expect(await continueEmailSignUp({ create }, "new@example.com")).toEqual({ kind: "required-fields" });
  });

  it("preserves a Clerk protection challenge before verification", async () => {
    const create = vi.fn().mockResolvedValue(resource({ protectCheck: {} as SignUpResource["protectCheck"] }));
    expect(await continueEmailSignUp({ create }, "new@example.com")).toEqual({
      kind: "navigate", path: "/sign-in/create/protect-check",
    });
  });

  it("only reports completion for a completed signup with a session", async () => {
    const create = vi.fn().mockResolvedValue(resource({ status: "complete", createdSessionId: "sess_test" }));
    expect(await continueEmailSignUp({ create }, "new@example.com")).toEqual({ kind: "complete", sessionId: "sess_test" });
  });

  it("leaves other verification requirements to Clerk", async () => {
    const create = vi.fn().mockResolvedValue(resource({ unverifiedFields: ["phone_number"] }));
    expect(await continueEmailSignUp({ create }, "new@example.com")).toEqual({
      kind: "navigate", path: "/sign-in/create/continue",
    });
  });

  it("propagates a failed attempt without navigating or silently retrying", async () => {
    const failure = new Error("Request failed");
    const create = vi.fn().mockRejectedValue(failure);
    await expect(continueEmailSignUp({ create }, "new@example.com")).rejects.toBe(failure);
    expect(create).toHaveBeenCalledOnce();
  });
});
