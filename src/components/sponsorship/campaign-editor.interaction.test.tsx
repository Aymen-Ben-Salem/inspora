// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: "owner-a" as string | null,
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  SignOutButton: ({
    children,
    redirectUrl,
  }: {
    children: import("react").ReactNode;
    redirectUrl: string;
  }) => <span data-sign-out-redirect={redirectUrl}>{children}</span>,
}));
vi.mock("@/features/media/prepare-and-upload", () => ({
  prepareAndUploadMedia: vi.fn(),
}));
import { CampaignEditor } from "./campaign-editor";

let container: HTMLDivElement, root: Root;
const fetchMock = vi.fn();
const preparation = (owner: string, saved = false) => ({
  id: `preparation-${owner}`,
  ownerUserId: owner,
  state: saved ? "ready" : "preparing",
  expiresAt: "2026-10-10T12:00:00Z",
  revision: saved ? 4 : 0,
  campaign: saved
    ? {
        creative: {
          title: "Owner A private campaign",
          url: "https://owner-a.example",
          tagline: "Private draft",
          iconId: "icon-a",
          wordmarkId: "wordmark-a",
          variantIds: [] as string[],
          assets: [
            {
              id: "icon-a",
              kind: "icon",
              url: "/api/sponsorship/assets/icon-a",
            },
          ],
        },
      }
    : null,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-a" };
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      value: preparation(state.auth.userId!, state.auth.userId === "owner-a"),
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});
const nameInput = () =>
  container.querySelector<HTMLInputElement>(
    'input[placeholder="Your product"]',
  )!;

it("clears an owner's private campaign when switching to another owner or signing out", async () => {
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("Owner A private campaign");
  expect(
    container.querySelector('[data-sign-out-redirect="/sponsor"]')?.textContent,
  ).toBe("Sign out");
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("");
  expect(container.innerHTML).not.toContain("owner-a.example");
  expect(container.innerHTML).not.toContain("/api/sponsorship/assets/icon-a");
  state.auth = { isLoaded: true, isSignedIn: false, userId: null };
  await act(async () => root.render(<CampaignEditor />));
  expect(container.textContent).toContain("Verify sponsor access to save");
  expect(container.textContent).not.toContain("Save private preparation");
  expect(container.textContent).not.toContain("Sign out");
});

it("cancels a pending save when its authenticated owner changes", async () => {
  await act(async () => root.render(<CampaignEditor />));
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  fetchMock.mockReturnValueOnce(pending);
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const options = fetchMock.mock.lastCall![1] as RequestInit;
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(options.signal?.aborted).toBe(true);
  await act(async () =>
    resolve({ ok: true, json: async () => ({ revision: 5 }) }),
  );
  expect(nameInput().value).toBe("");
  expect(container.textContent).not.toContain("Preparation saved.");
});

it("does not restore another owner's verification draft from browser storage", async () => {
  sessionStorage.setItem(
    "inspora:sponsor-typed",
    JSON.stringify({
      ownerUserId: "owner-a",
      title: "Private A draft",
      url: "https://owner-a.example",
      tagline: "",
    }),
  );
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("");
});
it("restores anonymous manual typing after sponsor verification", async () => {
  sessionStorage.setItem(
    "inspora:sponsor-typed",
    JSON.stringify({
      ownerUserId: null,
      title: "Typed before verification",
      url: "https://example.com",
      tagline: "For designers",
    }),
  );
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("Typed before verification");
  expect(sessionStorage.getItem("inspora:sponsor-typed")).toBeNull();
});

it("previews the website's three asset roles and excludes legacy taglines when saving", async () => {
  const draft = preparation("owner-a", true);
  draft.campaign!.creative.iconId = "";
  draft.campaign!.creative.wordmarkId = "";
  const assets = ["icon", "wordmark", "media"].map((kind) => ({
    id: `website-${kind}`,
    kind,
    contentType: "image/png",
    width: 600,
    height: 300,
    url: `/api/sponsorship/assets/website-${kind}`,
  }));
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      ok: true,
      value: url.endsWith("/metadata")
        ? {
            iconId: "website-icon",
            wordmarkId: "website-wordmark",
            mediaId: "website-media",
            assets,
          }
        : draft,
    }),
  }));
  await act(async () => root.render(<CampaignEditor />));
  expect(container.textContent).not.toContain("Tagline");
  expect(container.textContent).not.toContain("Private draft");
  const suggest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Suggest from website"),
  )!;
  await act(async () => suggest.click());
  for (const asset of assets) expect(container.innerHTML).toContain(asset.url);
  expect(nameInput().value).toBe("Owner A private campaign");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const saveOptions = fetchMock.mock.lastCall![1] as RequestInit;
  expect(JSON.parse(saveOptions.body as string)).toMatchObject({
    iconId: "website-icon",
    wordmarkId: "website-wordmark",
    mediaId: "website-media",
  });
  expect(JSON.parse(saveOptions.body as string)).not.toHaveProperty("tagline");
});

it("replaces existing assets only by explicit choice and clears superseded video attachments", async () => {
  const draft = preparation("owner-a", true);
  draft.campaign!.creative = {
    ...draft.campaign!.creative,
    variantIds: ["old-variant"],
  };
  Object.assign(draft.campaign!.creative, {
    mediaId: "old-video",
    posterId: "old-poster",
    videoPreviewId: "old-preview",
  });
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      ok: true,
      value: url.endsWith("/metadata")
        ? {
            iconId: "new-icon",
            wordmarkId: "new-wordmark",
            mediaId: "new-og",
            assets: [],
          }
        : draft,
    }),
  }));
  await act(async () => root.render(<CampaignEditor />));
  const replace = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  expect(replace.checked).toBe(false);
  await act(async () => replace.click());
  const suggest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Suggest from website"),
  )!;
  await act(async () => suggest.click());
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const body = JSON.parse(
    (fetchMock.mock.lastCall![1] as RequestInit).body as string,
  );
  expect(body).toMatchObject({
    title: "Owner A private campaign",
    iconId: "new-icon",
    wordmarkId: "new-wordmark",
    mediaId: "new-og",
    variantIds: [],
  });
  expect(body).not.toHaveProperty("posterId");
  expect(body).not.toHaveProperty("videoPreviewId");
});
