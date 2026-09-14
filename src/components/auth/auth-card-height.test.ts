import { afterEach, describe, expect, it, vi } from "vitest";
import { observeAuthCardHeight } from "./auth-card-height";

describe("auth card height", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    let resize = () => {};
    let mutate = () => {};
    const resizeDisconnect = vi.fn();
    const mutationDisconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = resizeDisconnect;
    });
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { mutate = callback; }
      observe = vi.fn();
      disconnect = mutationDisconnect;
    });
    const state = { mounted: true, otp: false, email: true, height: 517 };
    const card = {
      querySelector: (selector: string) => selector === ".cl-otpCodeField" ? state.otp : state.email,
      getBoundingClientRect: () => ({ height: state.height }),
    };
    const setProperty = vi.fn();
    const dialog = {
      querySelector: () => state.mounted ? card : null,
      style: { setProperty },
    } as unknown as HTMLElement;
    const cleanup = observeAuthCardHeight(dialog);
    return { state, setProperty, resize: () => resize(), mutate: () => mutate(), cleanup, resizeDisconnect, mutationDisconnect };
  }

  it("preserves the email height when the OTP screen grows", () => {
    const view = setup();
    expect(view.setProperty).toHaveBeenLastCalledWith("--auth-card-height", "517px");
    view.state.otp = true;
    view.state.height = 852;
    view.mutate();
    view.resize();
    expect(view.setProperty).toHaveBeenCalledTimes(1);
  });

  it("measures asynchronous mounting and remeasures the email screen on resize", () => {
    const view = setup();
    view.state.mounted = false;
    view.mutate();
    view.state.mounted = true;
    view.state.height = 530;
    view.mutate();
    expect(view.setProperty).toHaveBeenLastCalledWith("--auth-card-height", "530px");
    view.state.height = 545;
    view.resize();
    expect(view.setProperty).toHaveBeenLastCalledWith("--auth-card-height", "545px");
  });

  it("ignores transient loading content and stops observers on unmount", () => {
    const view = setup();
    view.state.email = false;
    view.state.height = 50;
    view.mutate();
    expect(view.setProperty).toHaveBeenCalledTimes(1);
    view.cleanup();
    expect(view.resizeDisconnect).toHaveBeenCalledOnce();
    expect(view.mutationDisconnect).toHaveBeenCalledOnce();
  });
});
