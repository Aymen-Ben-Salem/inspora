import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToAuthPath } from "./use-auth-pathname";

function browser(withNavigation = true) {
  const target = new EventTarget();
  const navigation = withNavigation ? new EventTarget() : undefined;
  const location = { pathname: "/sign-in" };
  vi.stubGlobal("window", Object.assign(target, {
    navigation, location, setInterval, clearInterval,
  }));
  return { target, navigation, location };
}

describe("auth browser-path subscription", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("observes Clerk's history navigation without a Next router update", async () => {
    const { navigation, location } = browser();
    const paths: string[] = [];
    const stop = subscribeToAuthPath(() => paths.push(location.pathname));
    location.pathname = "/sign-in/create";
    navigation!.dispatchEvent(new Event("currententrychange"));
    await Promise.resolve();
    expect(paths).toEqual(["/sign-in/create"]);
    stop();
  });

  it("observes browser back and forward navigation", async () => {
    const { target, location } = browser();
    const change = vi.fn();
    const stop = subscribeToAuthPath(change);
    location.pathname = "/sign-in";
    target.dispatchEvent(new Event("popstate"));
    await Promise.resolve();
    expect(change).toHaveBeenCalledOnce();
    stop();
  });

  it("detects native history changes in older browsers and stops checking on unmount", async () => {
    vi.useFakeTimers();
    const { location } = browser(false);
    const change = vi.fn();
    const stop = subscribeToAuthPath(change);
    await vi.advanceTimersByTimeAsync(200);
    expect(change).not.toHaveBeenCalled();
    location.pathname = "/sign-in/create";
    await vi.advanceTimersByTimeAsync(100);
    expect(change).toHaveBeenCalledOnce();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    location.pathname = "/";
    await vi.advanceTimersByTimeAsync(200);
    expect(change).toHaveBeenCalledOnce();
  });

  it("removes listeners and cancels queued notifications when the modal closes", async () => {
    const { navigation, target } = browser();
    const change = vi.fn();
    const stop = subscribeToAuthPath(change);
    navigation!.dispatchEvent(new Event("currententrychange"));
    stop();
    navigation!.dispatchEvent(new Event("currententrychange"));
    target.dispatchEvent(new Event("popstate"));
    await Promise.resolve();
    expect(change).not.toHaveBeenCalled();
  });
});
