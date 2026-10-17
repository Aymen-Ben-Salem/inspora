// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CampaignList } from "./campaign-list";
import type { OwnedCampaign } from "@/features/sponsorship/types";
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/sponsor/campaigns" }));
const creative = { title:"Current",url:"https://current.example.com",tagline:"",iconId:"i",wordmarkId:"w",variantIds:[],assets:[] };
const campaigns: OwnedCampaign[] = [{id:"current",checkoutId:"",versionId:"v1",revision:2,state:"published",expiresAt:"",creative},{id:"next",checkoutId:"",versionId:"v2",revision:1,state:"draft",expiresAt:"",creative:{...creative,title:"Next creative"}}];
it("invalidates visited sponsorship pages after confirming a campaign replacement", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const next = campaigns.map((campaign) => ({ ...campaign, state: campaign.id === "next" ? "published" : "archived" }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, value: { campaigns: next, readonly: false } })));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignList initial={{ campaigns, readonly: false }} />));
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Make public")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Confirm replacement")!.click());
    expect(container.textContent).toContain("Campaign is public");
    expect(navigation.refresh).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); navigation.refresh.mockReset(); vi.unstubAllGlobals(); }
});
it("names both creatives before replacing the public campaign and does not publish on Cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  const container=document.createElement("div"),root=createRoot(container);
  try {
    await act(async()=>root.render(<CampaignList initial={{campaigns,readonly:false}} />));
    await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==='Make public')!.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('This replaces “Current”');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Make “Next creative” public?');
    expect(fetch).not.toHaveBeenCalled();
    await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==='Cancel')!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();expect(fetch).not.toHaveBeenCalled();
    await act(async()=>root.render(<CampaignList initial={{campaigns,readonly:true}} key="readonly" />));
    expect(container.textContent).toContain('read-only');expect(container.querySelector('a[href="/sponsor/campaigns/new"]')).toBeNull();expect(container.querySelector('button')).toBeNull();
  }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it("shows a trash icon only for private campaigns and confirms before deleting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, value: { deleted: true } }))
    .mockResolvedValueOnce(Response.json({ ok: true, value: { campaigns: [campaigns[0]], readonly: false } }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignList initial={{ campaigns, readonly: false }} />));
    expect(container.querySelector('[aria-label="Delete Current"]')).toBeNull();
    const remove = container.querySelector<HTMLButtonElement>('[aria-label="Delete Next creative"]')!;
    expect(remove.querySelector("svg")).not.toBeNull();
    await act(async () => remove.click());
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Delete “Next creative”?");
    await act(async () => Array.from(container.querySelectorAll("button")).find(item => item.textContent === "Confirm deletion")!.click());
    expect(fetcher.mock.calls[0][0]).toBe("/api/sponsorship/campaigns/next");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ expectedRevision: 1 }) });
    expect(container.querySelector('[aria-label="Delete Next creative"]')).toBeNull();
    expect(container.textContent).toContain("Campaign deleted");
  } finally { await act(async () => root.unmount()); navigation.refresh.mockReset(); vi.unstubAllGlobals(); }
});
