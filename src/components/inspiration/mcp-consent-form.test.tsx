// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: mocks.getToken }) }));
import { McpConsentForm } from "./mcp-consent-form";
let root: Root, element: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); element = document.createElement("div"); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const props = { ticket: "t".repeat(43), csrf: "signed-form-token", details: { clientName: "Codex", redirectHost: "127.0.0.1" } };

it.each(["approve", "deny"] as const)("refreshes sign-in once and posts %s with all fields while buttons are disabled", async decision => {
  let release!: (value: string) => void;
  mocks.getToken.mockReturnValue(new Promise<string>(resolve => { release = resolve; }));
  let submitted: FormData | undefined;
  const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) { submitted = new FormData(this); });
  await act(async () => { root.render(<McpConsentForm {...props} />); });
  const button = element.querySelector<HTMLButtonElement>('button[value="' + decision + '"]')!;
  await act(async () => { button.click(); button.click(); });
  expect(mocks.getToken).toHaveBeenCalledExactlyOnceWith({ skipCache: true }); expect(submit).not.toHaveBeenCalled(); expect(button.disabled).toBe(true);
  await act(async () => { release("test-session"); });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(Object.fromEntries(submitted!)).toEqual({ ticket: props.ticket, csrf: props.csrf, decision });
  expect(element.querySelector("form")!.getAttribute("action")).toContain("?ticket=" + props.ticket);
});

it("does not submit consent when refreshing sign-in fails and allows another attempt", async () => {
  mocks.getToken.mockRejectedValue(Error("Session unavailable"));
  const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
  await act(async () => { root.render(<McpConsentForm {...props} />); });
  await act(async () => { element.querySelector<HTMLButtonElement>('button[value="approve"]')!.click(); });
  expect(submit).not.toHaveBeenCalled(); expect(element.querySelector('[role="alert"]')?.textContent).toContain("could not be refreshed");
  expect(element.querySelector<HTMLButtonElement>('button[value="approve"]')!.disabled).toBe(false);
});
