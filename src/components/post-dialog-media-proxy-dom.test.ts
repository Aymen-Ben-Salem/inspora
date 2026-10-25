// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

import { createMediaProxy, getCompensatedRadius, getCornerRadius } from "./post-dialog-media-proxy";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("keeps percentage icon corners proportional when animating from feed to detail", () => {
  const source = document.createElement("div");
  const hero = document.createElement("div");
  source.style.borderRadius = hero.style.borderRadius = "30%";
  document.body.append(source, hero);
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue({ width: 120, height: 120 } as DOMRect);
  vi.spyOn(hero, "getBoundingClientRect").mockReturnValue({ width: 600, height: 600 } as DOMRect);

  const initialRadius = getCompensatedRadius(getCornerRadius(source), .2, .2);
  expect(initialRadius).toBe(180);
  expect(getCornerRadius(hero)).toBe(initialRadius);
});

it("preserves pixel corner radii for other work", () => {
  const hero = document.createElement("div");
  hero.style.borderRadius = "12px";
  document.body.append(hero);
  expect(getCornerRadius(hero)).toBe(12);
});

it("uses the icon's corner shape for the temporary media layer", () => {
  const hero = document.createElement("div");
  const image = document.createElement("img");
  image.src = "/icon.webp";
  hero.style.setProperty("corner-shape", "superellipse(1.45)");
  hero.append(image);
  document.body.append(hero);

  const proxy = createMediaProxy({ media: hero, rect: { left: 0, top: 0, width: 600, height: 600 }, root: document.body });
  expect(proxy?.style.getPropertyValue("corner-shape")).toBe("superellipse(1.45)");
});
