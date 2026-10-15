// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/admin/posts" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: true, userId: "admin-a" }) }));
import { PublicSponsorsProvider } from "../sponsorship/public-sponsors";
import { ViewerProfileProvider } from "../profile/viewer-profile-provider";

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sponsors: [], serverTime: new Date().toISOString() }) });
  route.pathname = "/admin/posts";
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
function Providers() {
  return <PublicSponsorsProvider><ViewerProfileProvider><p>Admin</p></ViewerProfileProvider></PublicSponsorsProvider>;
}
it.each(["/admin", "/admin/posts", "/admin-access-denied"])("does not poll public placements or initialize a viewer creator on %s", async (pathname) => {
  route.pathname = pathname;
  await act(async () => root.render(<Providers />));
  await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
  expect(container.textContent).toContain("Admin");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("starts public requests after leaving admin and stops them when returning", async () => {
  await act(async () => root.render(<Providers />));
  route.pathname = "/websites";
  await act(async () => root.render(<Providers />));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/sponsorship/placements");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/profile");
  route.pathname = "/admin/websites";
  await act(async () => root.render(<Providers />));
  fetchMock.mockClear();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("inspora:viewer-profile-updated"));
    await vi.advanceTimersByTimeAsync(90000);
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
