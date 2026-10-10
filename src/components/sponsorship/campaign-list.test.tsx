// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CampaignList } from "./campaign-list";
import type { OwnedCampaign } from "@/features/sponsorship/types";
const creative = { title:"Current",url:"https://current.example.com",tagline:"",iconId:"i",wordmarkId:"w",variantIds:[],assets:[] };
const campaigns: OwnedCampaign[] = [{id:"current",checkoutId:"",versionId:"v1",revision:2,state:"published",expiresAt:"",creative},{id:"next",checkoutId:"",versionId:"v2",revision:1,state:"draft",expiresAt:"",creative:{...creative,title:"Next creative"}}];
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
