// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/creator-avatar", () => ({ CreatorAvatar: () => null }));
import { ProfileHeader } from "./profile-header";

const profile = {
  id: "11111111-1111-4111-8111-111111111111", name: "Creator", username: "creator",
  avatarUrl: "/avatar.png", websiteUrl: null, xProfileUrl: null,
};
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "available", count: 3, asOf: "2026-10-16T12:00:00Z" }) });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(createElement(ProfileHeader, {
    profile, owner: false, works: 2,
    views: { status: "available", count: 0, asOf: "2026-10-16T11:00:00Z" },
  })));
}
it("replaces a cached zero with the latest measured views while the profile stays open", async () => {
  await mount();
  expect(container.querySelector('[aria-label="3 published-work views"]')).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(`/api/creators/${profile.id}/views`, expect.objectContaining({cache:"no-store"}));
  fetchMock.mockResolvedValue({ok:true,json:async()=>({status:"available",count:4,asOf:"2026-10-16T12:01:00Z"})});
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(container.querySelector('[aria-label="4 published-work views"]')).not.toBeNull();
});
it("keeps the last measured count and labels it stale if refresh fails", async () => {
  await mount();
  fetchMock.mockRejectedValue(new Error("offline"));
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  const count = container.querySelector('[aria-label="3 published-work views"]');
  expect(count).not.toBeNull();
  expect(count?.getAttribute("title")).toContain("Last confirmed");
});
it("ignores an older response and stops refreshing after unmount", async () => {
  await mount();
  fetchMock.mockResolvedValue({ok:true,json:async()=>({status:"available",count:0,asOf:"2026-10-16T11:00:00Z"})});
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(container.querySelector('[aria-label="3 published-work views"]')).not.toBeNull();
  await act(async () => root.unmount());
  const requests = fetchMock.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(fetchMock).toHaveBeenCalledTimes(requests);
});
it("preserves a newer live total across an older server-rendered profile update", async () => {
  await mount();
  fetchMock.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(createElement(ProfileHeader, {
    profile, owner: false, works: 2,
    views: { status: "available", count: 0, asOf: "2026-10-16T11:30:00Z" },
  })));
  expect(container.querySelector('[aria-label="3 published-work views"]')).not.toBeNull();
});
it("accepts a lower count for newly checked eligibility even with an older provider sample", async () => {
  fetchMock.mockResolvedValue({ok:true,json:async()=>({status:"available",count:3,asOf:"2026-10-16T12:00:00Z",eligibilityKey:"before",checkedAt:"2026-10-16T12:00:00Z"})});
  await mount();
  fetchMock.mockResolvedValue({ok:true,json:async()=>({status:"available",count:0,asOf:"2026-10-16T11:30:00Z",eligibilityKey:"after",checkedAt:"2026-10-16T12:01:00Z"})});
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(container.querySelector('[aria-label="0 published-work views"]')).not.toBeNull();
});
it("does not resurrect an old server count after the API invalidates it", async () => {
  await mount();
  fetchMock.mockResolvedValue({ok:false,status:503,json:async()=>({status:"unavailable",checkedAt:"2026-10-16T12:01:00Z"})});
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(container.querySelector('[aria-label="Views unavailable"]')).not.toBeNull();
  await act(async () => root.render(createElement(ProfileHeader, {
    profile, owner: false, works: 2, views: {status:"unavailable"},
  })));
  await act(async () => root.render(createElement(ProfileHeader, {
    profile, owner: false, works: 2,
    views: {status:"available",count:3,asOf:"2026-10-16T12:00:00Z",checkedAt:"2026-10-16T12:00:00Z"},
  })));
  expect(container.querySelector('[aria-label="Views unavailable"]')).not.toBeNull();
});
it("does not let a delayed unavailable response clear a newer server count", async () => {
  let release!: (response: unknown) => void;
  fetchMock.mockReturnValue(new Promise(resolve => { release = resolve; }));
  await mount();
  await act(async () => root.render(createElement(ProfileHeader, {
    profile, owner: false, works: 2,
    views: {status:"available",count:8,asOf:"2026-10-16T12:02:00Z",checkedAt:"2026-10-16T12:02:00Z"},
  })));
  await act(async () => release({ok:false,status:503,json:async()=>({status:"unavailable",checkedAt:"2026-10-16T12:01:00Z"})}));
  expect(container.querySelector('[aria-label="8 published-work views"]')).not.toBeNull();
});
