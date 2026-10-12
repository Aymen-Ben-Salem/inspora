// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignsPanel } from "./campaign-list";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
const campaign = {id:"draft",state:"draft",revision:1,creative:{title:"Private draft",url:"https://example.com",tagline:"",assets:[]}};
it("shows a retryable failure rather than an empty library and honors endpoint read-only access", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ok:false,message:"Campaigns unavailable"},{status:503}))
    .mockResolvedValueOnce(Response.json({ok:true,value:{ownerUserId:"owner",readonly:true,campaigns:[campaign]}}));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignsPanel ownerUserId="owner" readonly={false} paused={false} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Campaigns unavailable");
    expect(container.textContent).not.toContain("No saved campaigns yet");
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain("Private draft");
    expect(container.textContent).toContain("read-only");
    expect(container.querySelector('a[href="/sponsor/campaigns/new"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
it("rejects another owner's response", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ok:true,value:{ownerUserId:"other",readonly:false,campaigns:[campaign]}})));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignsPanel ownerUserId="owner" readonly={false} paused={false} />));
    expect(container.textContent).toContain("Your account changed");
    expect(container.textContent).not.toContain("Private draft");
  } finally { await act(async () => root.unmount()); }
});
it("aborts loading when leaving Campaigns", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, options) => {signal=options.signal; return new Promise(() => {});}));
  const container = document.createElement("div"), root = createRoot(container);
  await act(async () => root.render(<CampaignsPanel ownerUserId="owner" readonly={false} paused={false} />));
  expect(container.textContent).toContain("Loading campaigns");
  await act(async () => root.unmount());
  expect(signal?.aborted).toBe(true);
});
it("keeps a published result when the dashboard rerenders, then removes mutation controls if access becomes read-only", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const value = {ownerUserId:"owner",readonly:false,campaigns:[campaign]};
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ok:true,value}))
    .mockResolvedValueOnce(Response.json({ok:true,value:{}}))
    .mockResolvedValueOnce(Response.json({ok:true,value:{...value,campaigns:[{...campaign,state:"published"}]}}));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"), root = createRoot(container);
  const render = (readonly: boolean) => root.render(<CampaignsPanel ownerUserId="owner" readonly={readonly} paused={false} />);
  const click = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!.click();
  try {
    await act(async () => render(false));
    await act(async () => click("Make public"));
    await act(async () => click("Confirm replacement"));
    expect(fetcher.mock.calls[1][1]).toMatchObject({method:"POST",body:JSON.stringify({expectedRevision:1})});
    await act(async () => render(false));
    expect(container.textContent).toContain("Campaign is public");
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === "Make public")).toBe(false);
    await act(async () => render(true));
    expect(container.textContent).toContain("read-only");
    expect(container.querySelector('button')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
