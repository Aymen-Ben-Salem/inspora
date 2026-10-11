// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: "owner-a",
    sessionId: "session-a",
  },
  createTotp: vi.fn(),
  verifyTotp: vi.fn(),
  createBackup: vi.fn(),
  startVerification: vi.fn(),
  attempt: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  useUser: () => ({
    user: {
      createTOTP: state.createTotp,
      verifyTOTP: state.verifyTotp,
      createBackupCode: state.createBackup,
      backupCodeEnabled: true,
    },
  }),
  useSession: () => ({
    session: {
      startVerification: state.startVerification,
      attemptSecondFactorVerification: state.attempt,
      getToken: state.token,
    },
  }),
  useReverification: (fn: unknown) => fn,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
import { SponsorSecurity } from "./sponsor-security";
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn(),
  replace = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  state.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: "owner-a",
    sessionId: "session-a",
  };
  state.createTotp.mockResolvedValue({
    uri: "otpauth://totp/Test?secret=FIXTUREONLY",
    secret: "FIXTUREONLY",
  });
  state.verifyTotp.mockResolvedValue({
    verified: true,
    backupCodes: ["fixture-recovery-a", "fixture-recovery-b"],
  });
  state.createBackup.mockResolvedValue({ codes: ["new-fixture-code"] });
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ state: "setup_required" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window.location, "replace").mockImplementation(replace);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent === label,
  )!;
const click = (label: string) => act(async () => button(label).click());
async function enterCode(code: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[autocomplete="one-time-code"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("enrolls locally, requires recovery-code acknowledgement and verifies before continuing", async () => {
  await act(async () => root.render(<SponsorSecurity />));
  await click("Set up authenticator");
  expect(container.querySelector("svg title")?.textContent).toBe(
    "Authenticator setup QR code",
  );
  expect(container.querySelector("img")).toBeNull();
  await enterCode("123456");
  await submit();
  expect(state.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
  expect(button("Continue").disabled).toBe(true);
  expect(container.textContent).toContain("fixture-recovery-a");
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .click(),
  );
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ state: "verification_required" }),
  });
  await click("Continue");
  expect(replace).not.toHaveBeenCalled();
  await enterCode("654321");
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ state: "ready" }),
  });
  await submit();
  expect(state.startVerification).toHaveBeenCalledWith({
    level: "second_factor",
  });
  expect(state.attempt).toHaveBeenCalledWith({
    strategy: "totp",
    code: "654321",
  });
  expect(state.token).toHaveBeenCalledWith({ skipCache: true });
  expect(replace).toHaveBeenCalledWith("/api/sponsorship/verify");
});
it("allows recovery-code sign-in without bypassing the server readiness check", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ state: "verification_required" }),
  });
  await act(async () => root.render(<SponsorSecurity />));
  await click("Use a recovery code");
  await enterCode("fixture-unused-code");
  await submit();
  expect(state.attempt).toHaveBeenCalledWith({
    strategy: "backup_code",
    code: "fixture-unused-code",
  });
  expect(replace).not.toHaveBeenCalled();
});
it("does not advance after an invalid authenticator code", async () => {
  await act(async () => root.render(<SponsorSecurity />));
  await click("Set up authenticator");
  state.verifyTotp.mockRejectedValue(new Error("invalid code"));
  await enterCode("123456");
  await submit();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("fixture-recovery-a");
  expect(replace).not.toHaveBeenCalled();
});
it("drops another owner's QR and pending enrollment results on account switch", async () => {
  let resolve!: (value: unknown) => void;
  state.createTotp.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => root.render(<SponsorSecurity />));
  await click("Set up authenticator");
  state.auth.userId = "owner-b";
  state.auth.sessionId = "session-b";
  await act(async () => root.render(<SponsorSecurity />));
  await act(async () =>
    resolve({
      uri: "otpauth://totp/Old?secret=PRIVATEOWNERAFIXTURE",
      secret: "PRIVATEOWNERAFIXTURE",
    }),
  );
  expect(container.innerHTML).not.toContain("PRIVATEOWNERAFIXTURE");
  expect(container.textContent).toContain("Set up authenticator");
  expect(state.verifyTotp).not.toHaveBeenCalled();
});
it("shows a safe sign-in entry for signed-out users", async () => {
  state.auth.isSignedIn = false;
  await act(async () => root.render(<SponsorSecurity />));
  expect(
    container.querySelector('a[href="/api/sponsorship/intent"]'),
  ).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
