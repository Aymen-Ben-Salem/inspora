// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PromotionsPanel } from "./promotions-panel";
import { DEFAULT_PROMO_LABEL } from "@/features/sponsorship/promo-label";

const campaign = { title: "affectUI", url: "https://www.affectui.com", mediaType: "image", mediaUrl: null, mediaPosterUrl: null, mediaWidth: 1200, mediaHeight: 800, iconUrl: null };
let container: HTMLDivElement, root: Root;
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const reply = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === text);
const badge = () => container.querySelector("[data-sponsor-promo-label]");

it("edits the account label with a live preview and saves it against the loaded revision", async () => {
  fetcher.mockImplementationOnce(() => reply({ ok: true, value: { label: null, revision: 0, readonly: false, campaign } }));
  await act(async () => root.render(<PromotionsPanel endpoint="/api/sponsorship/promotions" />));
  expect(fetcher).toHaveBeenCalledWith("/api/sponsorship/promotions", expect.objectContaining({ cache: "no-store" }));
  expect(container.textContent).toContain("On your live campaign, affectUI.");
  expect(badge()).toBeNull();
  expect(button("Save changes")!.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(badge()?.textContent).toBe("20% OFF Black Friday");
  expect(container.textContent).toContain("Unsaved changes");
  const saved = { ...DEFAULT_PROMO_LABEL };
  fetcher.mockImplementationOnce(() => reply({ ok: true, value: { label: saved, revision: 1, readonly: false, campaign } }));
  await act(async () => button("Save changes")!.click());
  const [url, init] = fetcher.mock.lastCall!;
  expect(url).toBe("/api/sponsorship/promotions");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({ label: saved, expectedRevision: 0 });
  expect(container.textContent).toContain("Saved. The label is live on the public campaign.");
  expect(button("Save changes")!.disabled).toBe(true);
});

it("reports a conflicting edit and reloads the latest promotions", async () => {
  fetcher.mockImplementationOnce(() => reply({ ok: true, value: { label: DEFAULT_PROMO_LABEL, revision: 3, readonly: false, campaign: null } }));
  await act(async () => root.render(<PromotionsPanel admin endpoint="/api/admin/sponsorship/account/promotions" />));
  expect(container.textContent).toContain("No campaign is live right now.");
  await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  fetcher.mockImplementationOnce(() => reply({ ok: false, code: "conflict", message: "Promotions changed elsewhere. Reload to see the latest version." }, 409));
  await act(async () => button("Save changes")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Promotions changed elsewhere.");
  fetcher.mockImplementationOnce(() => reply({ ok: true, value: { label: { ...DEFAULT_PROMO_LABEL, text: "Cyber Monday" }, revision: 4, readonly: false, campaign: null } }));
  await act(async () => button("Reload")!.click());
  expect(badge()?.textContent).toBe("Cyber Monday");
});

it("shows promotions read-only after the paid period ends", async () => {
  fetcher.mockImplementationOnce(() => reply({ ok: true, value: { label: DEFAULT_PROMO_LABEL, revision: 1, readonly: true, campaign } }));
  await act(async () => root.render(<PromotionsPanel endpoint="/api/sponsorship/promotions" />));
  expect(button("Save changes")).toBeUndefined();
  expect(container.querySelector("fieldset")!.disabled).toBe(true);
  expect(container.textContent).toContain("read-only");
});

it("waits until the tab is shown before loading", async () => {
  await act(async () => root.render(<PromotionsPanel endpoint="/api/sponsorship/promotions" active={false} />));
  expect(fetcher).not.toHaveBeenCalled();
});
