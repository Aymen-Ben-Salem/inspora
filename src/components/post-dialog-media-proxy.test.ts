import { describe, expect, it } from "vitest";

import {
  resolveProxyObjectFit,
  shouldAnimateDialogBackdrop,
} from "./post-dialog-media-proxy";

describe("post dialog media transitions", () => {
  it("preserves contain sizing for transparent logo media", () => {
    expect(resolveProxyObjectFit("contain")).toBe("contain");
    expect(resolveProxyObjectFit("cover")).toBe("cover");
  });

  it("keeps the backdrop visible behind transparent media", () => {
    const transparentHero = {
      hasAttribute: (name: string) =>
        name === "data-post-dialog-transparent-media",
    };
    const opaqueHero = {
      hasAttribute: () => false,
    };

    expect(shouldAnimateDialogBackdrop(transparentHero)).toBe(false);
    expect(shouldAnimateDialogBackdrop(opaqueHero)).toBe(true);
  });
});
