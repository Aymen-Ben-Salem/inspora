// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/features/admin/editorial-evidence", () => ({ prepareEditorialEvidence: async () => [{ dataUrl: "data:image/jpeg;base64,eA==", frameSeconds: null }] }));
import EditorialPanel from "./editorial-panel";
const proposal = { fields: [{ field: "description", value: "Generated description", reason: "Visible subject" }, { field: "colors", value: "Black", reason: "Visible color" }], hiddenNotes: { scope: "component", visualNotes: "A compact control uses a single dark surface.", typography: null, typographyIsSubject: false }, uncertainty: ["Motion cannot be verified from a still image."] };
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
async function setup() {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const fetcher = vi.fn().mockImplementation(async (_url, options) => new Response(JSON.stringify(options.method === "POST" ? { id: "1c51893b-bc44-4d48-933b-e1402c74dc95", proposal, costUsd: .012 } : { ok: true })));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(<form><input name="title" defaultValue="Study" /><input name="sourceUrl" defaultValue="https://example.com" /><textarea name="description" defaultValue="Original" /><input name="colors" defaultValue="Blue" /><input name="media" type="hidden" value={JSON.stringify([{ type: "image", url: "https://example.com/work.jpg", width: 800, height: 600 }])} /><EditorialPanel kind="design" /></form>));
  const click = async (text: string) => { const button = [...host.querySelectorAll("button")].find(b => b.textContent === text)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
  return { root, host, fetcher, click };
}
it("generates only on request, shows uncertainty and applies selected fields without submitting", async () => {
  const { root, host, fetcher, click } = await setup();
  const submit = vi.fn(); host.querySelector("form")!.addEventListener("submit", submit);
  expect(fetcher).not.toHaveBeenCalled(); await click("Generate suggestions");
  expect(host.textContent).toContain("Motion cannot be verified");
  expect(host.querySelector("textarea")!.value).toBe("Original");
  const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => boxes[1].click());
  await click("Apply selected to form");
  expect(host.querySelector("textarea")!.value).toBe("Generated description");
  expect(host.querySelector<HTMLInputElement>('input[name="colors"]')!.value).toBe("Blue");
  expect(JSON.parse(host.querySelector<HTMLInputElement>('input[name="editorialReview"]')!.value)).toMatchObject({ selected: ["description"], notes: true });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
it("refuses to overwrite an edit made after generation", async () => {
  const { root, host, click } = await setup(); await click("Generate suggestions");
  host.querySelector("textarea")!.value = "Team edit";
  await click("Apply selected to form");
  expect(host.querySelector("textarea")!.value).toBe("Team edit");
  expect(host.textContent).toContain("work changed");
  expect(host.querySelector<HTMLInputElement>('input[name="editorialReview"]')!.value).toBe("");
  await act(async () => root.unmount());
});
