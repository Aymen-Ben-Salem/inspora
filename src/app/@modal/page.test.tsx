import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DefaultModal from "./default";
import RootModal from "./page";

describe("root parallel modal slot", () => {
  it("has an explicit empty root state for soft navigation after auth", () => {
    expect(renderToStaticMarkup(<RootModal />)).toBe("");
    expect(renderToStaticMarkup(<DefaultModal />)).toBe("");
  });
});
