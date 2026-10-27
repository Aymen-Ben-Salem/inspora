// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ArchiveFilterMenu } from "./archive-filter-menu";

const options = [{ count: 2, value: "Editorial" }];

describe("ArchiveFilterMenu", () => {
  it("uses muted search-text grey when no filter is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveFilterMenu
        label="Style"
        options={options}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('style="color:#767676"');
    expect(markup).toContain("w-[var(--archive-filter-width)]");
    expect(markup).toContain("gap-[var(--archive-filter-gap)]");
  });

  it("uses archive black when a filter is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveFilterMenu
        label="Style"
        options={options}
        selected={["Editorial"]}
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('style="color:#262626"');
    expect(markup).toContain("w-[var(--archive-filter-selected-width)]");
  });
});

describe("archive filter menu dismissal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let toggle: Mock<(value: string) => void>;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    toggle = vi.fn();
    await act(async () => root.render(<ArchiveFilterMenu label="Style" options={options} selected={[]} onToggle={toggle} />));
    container.querySelector("details")!.open = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each(["mouse", "touch"])("closes after an outside %s press", async (pointerType) => {
    await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType })));
    expect(container.querySelector("details")!.open).toBe(false);
  });

  it("keeps the menu open when searching and selecting options inside it", async () => {
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => search.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector("details")!.open).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(toggle).toHaveBeenCalledWith("Editorial");
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("closes with Escape and returns keyboard focus to the filter trigger", async () => {
    container.querySelector<HTMLInputElement>('input[type="search"]')!.focus();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector("details")!.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("summary"));
  });
});
