// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { EditorialAssistant, type EditorialNoteState } from "./editorial-assistant";

afterEach(() => { document.body.innerHTML = ""; });
async function render(noteStatus: EditorialNoteState) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  await act(async () => createRoot(host).render(<EditorialAssistant kind="logo" hasMedia noteStatus={noteStatus} />));
  return host;
}

it("explains catalog-review notes and highlights those that need a refresh", async () => {
  const review = await render("review");
  const current = Array.from(review.querySelectorAll("p")).find(p => p.textContent?.startsWith("Search notes come from the catalog review"));
  expect(current?.textContent).toBe("Search notes come from the catalog review. Generate details to replace them.");
  expect(current?.className).not.toContain("font-medium");
  document.body.innerHTML = "";
  const stale = await render("review-stale");
  const line = Array.from(stale.querySelectorAll("p")).find(p => p.textContent?.startsWith("Catalog-review search notes"));
  expect(line?.textContent).toBe("Catalog-review search notes no longer match this work. Generate details to refresh them.");
  expect(line?.className).toContain("font-medium");
  expect((await render("none")).textContent).toContain("No search notes yet.");
});
