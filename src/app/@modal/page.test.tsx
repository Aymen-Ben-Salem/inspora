import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DefaultModal from "./default";
import RootModal from "./page";
import CreatorProfileModalSlot from "./creators/[username]/page";
import OwnerProfileModalSlot from "./profile/page";

describe("root parallel modal slot", () => {
  it("has an explicit empty root state for soft navigation after auth", () => {
    expect(renderToStaticMarkup(<RootModal />)).toBe("");
    expect(renderToStaticMarkup(<DefaultModal />)).toBe("");
  });

  it("renders no retained overlay at non-modal destinations such as creator profiles", () => {
    expect(renderToStaticMarkup(<CreatorProfileModalSlot />)).toBe("");
    expect(renderToStaticMarkup(<OwnerProfileModalSlot />)).toBe("");
  });
});
