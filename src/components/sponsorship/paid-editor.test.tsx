// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "owner" }),
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/media/prepare-and-upload", () => ({
  prepareAndUploadMedia: vi.fn(),
}));
import { CampaignEditor } from "./campaign-editor";
import type { OwnedCampaign } from "@/features/sponsorship/types";
const campaign: OwnedCampaign = {
  id: "campaign",
  checkoutId: "pinned",
  versionId: "v1",
  revision: 5,
  state: "published",
  expiresAt: "",
  creative: {
    title: "Current public name",
    url: "https://current.example.com",
    tagline: "",
    iconId: "i",
    wordmarkId: "w",
    variantIds: [],
    assets: [],
  },
};
it("loads a paid version without opening preparation and saves a complete optimistic edit; Cancel has no write", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, value: { ...campaign, revision: 6 } }),
  }));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(async () =>
      root.render(<CampaignEditor paid={{ campaign, readonly: false }} />),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="Your product"]',
      )?.value,
    ).toBe("Current public name");
    expect(
      container.querySelector('a[href="/sponsor/campaigns"]')?.textContent,
    ).toContain("Cancel");
    await act(async () =>
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/sponsorship/campaigns/campaign",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"expectedRevision":5'),
      }),
    );
    expect(container.textContent).toContain("Public changes saved");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
