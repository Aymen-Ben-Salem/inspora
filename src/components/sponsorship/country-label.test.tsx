// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CountryLabel, countryName } from "./country-label";
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("uses local flags and English names, with GER if Germany's image fails", async () => {
  await act(async () => root.render(<CountryLabel code="de" />));
  expect(container.textContent).toBe("Germany");
  expect(new URL(container.querySelector("img")!.src).pathname).toBe("/icons/flags/de.svg");
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.textContent).toBe("GERGermany");
  expect(container.querySelector("img")).toBeNull();
  await act(async () => root.render(<CountryLabel code="US" />));
  expect(new URL(container.querySelector("img")!.src).pathname).toBe("/icons/flags/us.svg");
  expect(container.textContent).toContain("United States");
});
it("handles unknown and invalid country values without requesting a flag", async () => {
  for (const code of ["Unknown", "ZZ", "../de", ""]) {
    await act(async () => root.render(<CountryLabel code={code} />));
    expect(countryName(code)).toBe("Unknown");
    expect(container.textContent).toContain("Unknown");
    expect(container.querySelector("img")).toBeNull();
  }
});
