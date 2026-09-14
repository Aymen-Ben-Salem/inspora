import type { MouseEvent, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { replace, back } = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, back }) }));
import { AuthModalShell } from "./auth-modal-shell";

describe("auth modal dismissal", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

  function clickOutside(inside = false) {
    const shell = AuthModalShell({ label: "Sign in", overlay: true, children: null });
    const dismiss = shell.props.children[1] as ReactElement<{ onClick: (event: MouseEvent<HTMLDivElement>) => void }>;
    const surface = {};
    dismiss.props.onClick({ currentTarget: surface, target: inside ? {} : surface } as MouseEvent<HTMLDivElement>);
  }

  it.each([1, 2, 5])("closes in one click with %s history entries", (length) => {
    vi.stubGlobal("window", { history: { length } });
    clickOutside();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/", { scroll: false });
    expect(back).not.toHaveBeenCalled();
  });

  it("does not dismiss clicks inside the dialog", () => {
    clickOutside(true);
    expect(replace).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
