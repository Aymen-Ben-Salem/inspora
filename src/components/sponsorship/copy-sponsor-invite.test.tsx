// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CopySponsorInvite } from "./copy-sponsor-invite";

const inviteId = "766ab801-5176-428c-aa4a-6ac90ab476fb";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

it("copies the complete invite for the current site without navigating", async () => {
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const page = location.href;
  await act(async () => root.render(<CopySponsorInvite inviteId={inviteId} />));
  await act(async () => container.querySelector("button")!.click());

  expect(write).toHaveBeenCalledExactlyOnceWith(`${location.origin}/sponsor/dashboard/invite/${inviteId}`);
  expect(location.href).toBe(page);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied to clipboard");
});

it("offers the full URL for manual copying when clipboard access fails", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard unavailable"));
  await act(async () => root.render(<CopySponsorInvite inviteId={inviteId} />));
  await act(async () => container.querySelector("button")!.click());

  const input = container.querySelector<HTMLInputElement>('input[aria-label="Sponsor invite URL"]');
  expect(input?.readOnly).toBe(true);
  expect(input?.value).toBe(`${location.origin}/sponsor/dashboard/invite/${inviteId}`);
});
