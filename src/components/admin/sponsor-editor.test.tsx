// @vitest-environment happy-dom
import { act, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminActionState, AdminSponsorRecord } from "@/features/admin/types";

const mocks = vi.hoisted(() => ({ getSponsor: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/features/admin/sponsor-repository", () => ({ getAdminSponsor: mocks.getSponsor }));
vi.mock("@/features/admin/actions", () => ({ saveSponsorAction: mocks.save, deleteSponsorAction: mocks.remove }));
vi.mock("@/features/admin/website-metadata", () => ({ fetchWebsiteMetadataAction: vi.fn() }));
vi.mock("./sponsor-upload", () => ({ AdminSponsorUpload: () => null }));
vi.mock("@/components/sponsorship/campaign-preview", () => ({ CampaignPreview: () => null }));
import AdminSponsorPage from "@/app/admin/sponsor/page";

const sponsor: AdminSponsorRecord = {
  id: "manual-1", title: "Existing manual sponsor", url: "https://example.com", tagline: "Existing description",
  mediaType: "image", mediaWidth: 1200, mediaHeight: 800, mediaAlt: "", isActive: false,
  createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z",
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const redirected = vi.fn();
class RedirectBoundary extends Component<{ children: ReactNode }, { redirected: boolean }> {
  state = { redirected: false };
  static getDerivedStateFromError() { return { redirected: true }; }
  componentDidCatch(error: Error) { redirected(error); }
  render() { return this.state.redirected ? null : this.props.children; }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.getSponsor.mockResolvedValue(sponsor);
  mocks.remove.mockResolvedValue({ status: "idle" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container, { onCaughtError: () => {} });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(saved?: string) {
  const page = await AdminSponsorPage({ searchParams: Promise.resolve({ saved }) });
  await act(async () => root.render(<RedirectBoundary>{page}</RedirectBoundary>));
}
function deleteButton() { return [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete sponsor"); }

it("lets the framework handle a successful delete redirect without showing a deletion error", async () => {
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/admin/sponsor?saved=deleted;303;" });
  mocks.remove.mockRejectedValueOnce(redirect);
  await render(); await act(async () => deleteButton()!.click());
  expect(redirected).toHaveBeenCalledWith(redirect);
  expect(container.textContent).not.toContain("Could not remove the sponsor");
});

it("clears the removed sponsor's fields when deletion refreshes the page without a record", async () => {
  await render();
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(sponsor.title);
  mocks.getSponsor.mockResolvedValue(null);
  await render("deleted");
  expect(container.textContent).toContain("Sponsor has been removed.");
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("");
  expect(container.querySelector<HTMLInputElement>('[name="url"]')!.value).toBe("");
  expect(deleteButton()).toBeUndefined();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("keeps the saved sponsor and Delete button available after a real failure, then permits retry", async () => {
  mocks.remove.mockResolvedValue({ status: "error", message: "Could not remove the sponsor. Try again." } satisfies AdminActionState);
  await render();
  await act(async () => deleteButton()!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not remove the sponsor. Try again.");
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(sponsor.title);
  expect(deleteButton()?.disabled).toBe(false);
  await act(async () => deleteButton()!.click());
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("does not delete when the confirmation is canceled", async () => {
  vi.mocked(confirm).mockReturnValue(false);
  await render(); await act(async () => deleteButton()!.click());
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});

it("can delete an existing sponsor even when an unsaved required field is empty", async () => {
  await render();
  const title = container.querySelector<HTMLInputElement>('[name="title"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    deleteButton()!.click();
  });
  expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
});
