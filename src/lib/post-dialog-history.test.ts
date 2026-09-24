import { afterEach, expect, it, vi } from "vitest";
import { installPostDialogHistory, registerPostDialogHistory } from "./post-dialog-history";

afterEach(() => vi.unstubAllGlobals());

it("holds router navigation only while a visible dialog handles history", () => {
  const browser = new EventTarget();
  vi.stubGlobal("window", browser);
  installPostDialogHistory();
  const router = vi.fn();
  browser.addEventListener("popstate", router);
  const dialog = vi.fn((event: PopStateEvent) => event.stopImmediatePropagation());
  const unregister = registerPostDialogHistory(dialog);
  browser.dispatchEvent(new Event("popstate"));
  expect(dialog).toHaveBeenCalledOnce();
  expect(router).not.toHaveBeenCalled();
  unregister();
  browser.dispatchEvent(new Event("popstate"));
  expect(router).toHaveBeenCalledOnce();
});

it("does not remove the active dialog handler when an older dialog cleans up", () => {
  const browser = new EventTarget();
  vi.stubGlobal("window", browser);
  installPostDialogHistory();
  const oldDialog = vi.fn();
  const activeDialog = vi.fn();
  const unregisterOld = registerPostDialogHistory(oldDialog);
  const unregisterActive = registerPostDialogHistory(activeDialog);
  unregisterOld();
  browser.dispatchEvent(new Event("popstate"));
  expect(oldDialog).not.toHaveBeenCalled();
  expect(activeDialog).toHaveBeenCalledOnce();
  unregisterActive();
});
