// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveDraft: vi.fn(), readDraft: vi.fn(), clearDraft: vi.fn(),
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: "owner-a" as string | null,
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }), usePathname: () => "/sponsor/start" }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  useUser: () => ({ user: state.auth.isSignedIn ? { primaryEmailAddress: { emailAddress: "owner@example.com" } } : null }),
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
vi.mock("./local-campaign-draft", async importOriginal => ({
  ...await importOriginal<typeof import("./local-campaign-draft")>(),
  saveLocalDraft: state.saveDraft, readLocalDraft: state.readDraft, clearLocalDraft: state.clearDraft,
}));
import { prepareAndUploadMedia } from "@/features/media/prepare-and-upload";
import { CampaignEditor } from "./campaign-editor";

let container: HTMLDivElement, root: Root;
const fetchMock = vi.fn();
const preparation = (owner: string, saved = false) => ({
  id: `preparation-${owner}`,
  ownerUserId: owner,
  state: saved ? "ready" : "preparing",
  expiresAt: "2026-10-10T12:00:00Z",
  revision: saved ? 4 : 0,
  contact: { company: "Fixture company", contactName: "Fixture owner", email: "owner@example.com" },
  campaign: saved
    ? {
        creative: {
          title: "Owner A private campaign",
          url: "https://owner-a.example",
          tagline: "Private draft",
          feedDescription: "A private workspace for creative teams.",
          iconId: "icon-a",
          wordmarkId: "wordmark-a",
          variantIds: [] as string[],
          assets: [
            {
              id: "icon-a",
              kind: "icon",
              url: "/api/sponsorship/assets/icon-a",
              contentType: "image/png", sizeBytes: 12, width: 64, height: 64, digest: "a".repeat(64),
            },
          ],
        },
      }
    : null,
});
beforeEach(() => {
  state.refresh.mockReset();
  state.saveDraft.mockReset().mockResolvedValue(undefined);
  state.readDraft.mockReset().mockResolvedValue(null);
  state.clearDraft.mockReset().mockResolvedValue(undefined);
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
  vi.restoreAllMocks();
});
const nameInput = () =>
  container.querySelector<HTMLInputElement>(
    'input[placeholder="Your product"]',
  )!;

const checkoutButton = () => container.querySelector<HTMLButtonElement>('button[value="checkout"]')!;
const submitCheckout = () => container.querySelector("form")!.dispatchEvent(
  new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: checkoutButton() }),
);

it.each([false, true])("lets visitors enter a campaign without a setup gate (signed in: %s)", async signedIn => {
  state.auth = { isLoaded: true, isSignedIn: signedIn, userId: signedIn ? "owner-a" : null };
  fetchMock.mockResolvedValueOnce(Response.json({ ok: false, message: "Verify sponsor access." }, { status: 401 }));
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().disabled).toBe(false);
  expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.disabled).toBe(false);
  expect(checkoutButton().disabled).toBe(false);
  expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(false);
  expect(container.textContent).not.toContain("Finish setting up");
  expect(container.textContent).not.toContain("authenticator");
  expect(container.textContent).not.toContain("Only visible to you");
  expect(container.querySelector('input[name="company"]')).not.toBeNull();
  expect(container.querySelector('input[name="contactName"]')).not.toBeNull();
  expect(container.querySelector('input[name="email"]')).not.toBeNull();
});

it.each(["one_time", "subscription"] as const)("saves current creative before opening %s checkout directly", async (billingMode) => {
  const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  await act(async () => root.render(<CampaignEditor />));
  if (billingMode === "subscription") {
    await act(async () => container.querySelector<HTMLInputElement>('input[value="subscription"]')!.click());
  }
  const review = container.querySelector('[aria-labelledby="checkout-review-title"]')!;
  expect(review.textContent).toContain(billingMode === "subscription" ? "Subscribe · Monthly" : "One-off · 1 calendar month");
  expect(review.textContent).toContain("$750");
  expect(review.textContent).not.toContain("€700");
  expect(container.querySelector<HTMLInputElement>(`input[value="${billingMode}"]`)?.checked).toBe(true);
  let finishSave!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finishSave = resolve; }));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { url: "https://checkout.stripe.com/session" } }));
  await act(async () => { submitCheckout(); submitCheckout(); });
  expect(checkoutButton().disabled).toBe(true);
  expect(checkoutButton().textContent).toContain("Opening checkout");
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout"))).toHaveLength(0);
  const saves = fetchMock.mock.calls.filter(([, options]) => options.method === "PUT");
  expect(saves).toHaveLength(1);
  expect(JSON.parse(saves[0][1].body)).toMatchObject({ title: "Owner A private campaign", expectedRevision: 4, feedDescription: "A private workspace for creative teams." });
  await act(async () => finishSave(Response.json({ ok: true, value: { checkoutId: "checkout-a", revision: 5 } })));
  const checkout = fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout"))!;
  expect(JSON.parse(checkout[1].body)).toEqual({ checkoutId: "checkout-a", billingMode, currency: "usd" });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.com/session");
});

it("shows save failures below checkout without starting payment", async () => {
  const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: false, message: "Upload your wordmark first." }, { status: 400 }));
  await act(async () => { submitCheckout(); });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Upload your wordmark first.");
  expect(container.querySelector('[role="alert"]')?.previousElementSibling?.contains(checkoutButton())).toBe(true);
  expect(checkoutButton().disabled).toBe(false);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/checkout"))).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

it("sends the automatic euro price without offering a currency selector", async () => {
  vi.spyOn(window.location, "assign").mockImplementation(() => {});
  await act(async () => root.render(<CampaignEditor initialCurrency="eur" />));
  const review = container.querySelector('[aria-labelledby="checkout-review-title"]')!;
  expect(review.textContent).toContain("€700");
  expect(review.textContent).not.toContain("$750");
  expect(container.querySelector("select")).toBeNull();
  const cards = container.querySelector('input[value="subscription"]')!.closest("fieldset")!;
  expect(cards.textContent).toContain("€700");
  expect(cards.textContent).not.toContain("$750");
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { checkoutId: "checkout-a", revision: 5 } }));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { url: "https://checkout.stripe.com/session" } }));
  await act(async () => { submitCheckout(); });
  expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({ checkoutId: "checkout-a", billingMode: "one_time", currency: "eur" });
});

it("preserves the saved revision when checkout is unavailable", async () => {
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { checkoutId: "checkout-a", revision: 5 } }));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: false, message: "No sponsorship seats available." }, { status: 409 }));
  await act(async () => { submitCheckout(); });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("No sponsorship seats available.");
  expect(nameInput().value).toBe("Owner A private campaign");
  expect(checkoutButton().disabled).toBe(false);
  fetchMock.mockResolvedValueOnce(Response.json({ ok: false, message: "Try again." }, { status: 503 }));
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(JSON.parse(fetchMock.mock.lastCall![1].body).expectedRevision).toBe(5);
});

it("retries checkout without editing a preparation reserved before a lost response", async () => {
  const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { checkoutId: "checkout-a", revision: 5 } }));
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await act(async () => { submitCheckout(); });
  expect(container.textContent).toContain("Manage pending checkout");
  fetchMock.mockImplementation(async (url, options) => options.method === "PUT"
    ? Response.json({ ok: false, message: "Checkout has pinned this preparation." }, { status: 409 })
    : Response.json({ ok: true, value: { url: "https://checkout.stripe.com/reserved" } }));
  await act(async () => { submitCheckout(); });
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PUT")).toHaveLength(1);
  expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({ checkoutId: "checkout-a", billingMode: "one_time", currency: "usd" });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.com/reserved");
});

it("requires valid contact details before authentication and keeps checkout out of the paid editor", async () => {
  state.auth = { isLoaded: true, isSignedIn: false, userId: null };
  await act(async () => root.render(<CampaignEditor />));
  expect(checkoutButton().disabled).toBe(false);
  await act(async () => { submitCheckout(); });
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => root.render(<CampaignEditor key="paid-page" paid={{ readonly: false }} />));
  expect(checkoutButton()).toBeNull();
  expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Save changes");
});

it("invalidates prefetched dashboard data after saving a private preparation", async () => {
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: { revision: 5 } }));
  await act(async () => container.querySelector("form")!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  ));
  expect(container.textContent).toContain("Preparation saved.");
  expect(state.refresh).toHaveBeenCalledTimes(1);
});

it("keeps the current route intact when saving a preparation fails", async () => {
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: false, message: "Save unavailable." }, { status: 503 }));
  await act(async () => container.querySelector("form")!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  ));
  expect(container.textContent).toContain("Save unavailable.");
  expect(state.refresh).not.toHaveBeenCalled();
});

it("clears an owner's private campaign when switching to another owner or signing out", async () => {
  await act(async () => root.render(<CampaignEditor />));
  expect(container.querySelector("form")!.firstElementChild?.textContent).toContain("Contact details");
  expect(container.textContent).not.toContain("Complete account setup above");
  expect(nameInput().value).toBe("Owner A private campaign");
  expect(container.textContent).not.toContain("Sign out");
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("");
  expect(container.innerHTML).not.toContain("owner-a.example");
  expect(container.innerHTML).not.toContain("/api/sponsorship/assets/icon-a");
  state.auth = { isLoaded: true, isSignedIn: false, userId: null };
  await act(async () => root.render(<CampaignEditor />));
  expect(container.querySelector('input[name="email"]')?.getAttribute("readonly")).toBeNull();
  expect(container.textContent).not.toContain("Save for later");
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
      feedDescription: "Written before signing in.",
    }),
  );
  state.auth = { isLoaded: true, isSignedIn: true, userId: "owner-b" };
  await act(async () => root.render(<CampaignEditor />));
  expect(nameInput().value).toBe("Typed before verification");
  expect(container.querySelector<HTMLTextAreaElement>('textarea[name="feedDescription"]')?.value).toBe("Written before signing in.");
  expect(sessionStorage.getItem("inspora:sponsor-typed")).toBeNull();
});

it("previews the website caption and keeps it out of the design and logo feed preview", async () => {
  await act(async () => root.render(<CampaignEditor />));
  const preview = container.querySelector('[aria-label="Placement previews"]')!;
  const feed = () => preview.querySelector('[data-sponsor-placement="feed"]')!;
  expect(feed().querySelector("p")?.textContent).toBe("A private workspace for creative teams.");
  const choices = preview.querySelector('[aria-label="Feed preview"]')!;
  const design = Array.from(choices.querySelectorAll("button")).find(button => button.textContent === "Design & logos")!;
  await act(async () => design.click());
  expect(design.getAttribute("aria-pressed")).toBe("true");
  expect(feed().textContent).not.toContain("A private workspace for creative teams.");
  expect(feed().querySelector('a[aria-label="Visit Owner A private campaign website"]')).toBeNull();
  const websites = Array.from(choices.querySelectorAll("button")).find(button => button.textContent === "Websites")!;
  await act(async () => websites.click());
  expect(feed().querySelector('a[aria-label="Visit Owner A private campaign website"] img')?.getAttribute("src")).toBe("/api/sponsorship/assets/icon-a");
  expect(container.querySelector<HTMLTextAreaElement>('textarea[name="feedDescription"]')?.value).toBe("A private workspace for creative teams.");
});

it.each([
  [
    504,
    undefined,
    "Suggestions are unavailable. Continue with manual fields and uploads.",
  ],
  [
    429,
    "challenge",
    "A security check interrupted the request. Open this site in another tab to complete the check, then try again.",
  ],
] as const)(
  "keeps the campaign editable when website suggestions return an HTML error page (%s)",
  async (status, mitigated, message) => {
    await act(async () => root.render(<CampaignEditor />));
    const headers = new Headers({ "Content-Type": "text/html" });
    if (mitigated) headers.set("x-vercel-mitigated", mitigated);
    fetchMock.mockResolvedValueOnce(
      new Response("<!DOCTYPE html><html><body>Request interrupted</body></html>", {
        status,
        headers,
      }),
    );
    const suggest = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Suggest from website"),
    )!;

    await act(async () => suggest.click());

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(message);
    expect(alert?.previousElementSibling).toBe(suggest);
    expect(nameInput().value).toBe("Owner A private campaign");
    expect(
      container.querySelector<HTMLInputElement>('input[type="url"]')?.value,
    ).toBe("https://owner-a.example");
    expect(suggest.disabled).toBe(false);
  },
);

it("shows suggestion loading only on empty fields and clears it when suggestions finish", async () => {
  const draft = preparation("owner-a", true);
  draft.campaign!.creative.title = "";
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: draft }));
  await act(async () => root.render(<CampaignEditor />));
  let finish!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  const suggest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Suggest from website"),
  )!;
  const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

  await act(async () => suggest.click());

  expect(nameInput().getAttribute("aria-busy")).toBe("true");
  expect(nameInput().parentElement?.querySelector("svg")).not.toBeNull();
  expect(input("Feed image or video (optional)").getAttribute("aria-busy")).toBe("true");
  expect(input("Feed image or video (optional)").closest("label")?.textContent).toContain("Finding website suggestion");
  expect(input("Compact icon").getAttribute("aria-busy")).not.toBe("true");
  expect(input("Full wordmark").getAttribute("aria-busy")).not.toBe("true");
  expect(input("Replace video poster (optional)").getAttribute("aria-busy")).not.toBe("true");
  expect(container.querySelector('input[type="url"]')?.getAttribute("aria-busy")).not.toBe("true");
  expect(suggest.disabled).toBe(true);
  expect(suggest.nextElementSibling?.textContent).toContain("Finding suggestions");

  await act(async () => finish(Response.json({ ok: true, value: { title: "Suggested product", assets: [] } })));

  expect(nameInput().value).toBe("Suggested product");
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(suggest.disabled).toBe(false);
  expect(suggest.nextElementSibling?.textContent).toContain("Website suggestions imported");
});

it("shows loading on replacement assets and clears it after a local suggestion error", async () => {
  await act(async () => root.render(<CampaignEditor />));
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  let fail!: (error: Error) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((_resolve, reject) => { fail = reject; }));
  const suggest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Suggest from website"),
  )!;

  await act(async () => suggest.click());

  expect(nameInput().getAttribute("aria-busy")).not.toBe("true");
  for (const label of ["Compact icon", "Full wordmark", "Feed image or video (optional)"])
    expect(container.querySelector(`input[aria-label="${label}"]`)?.getAttribute("aria-busy")).toBe("true");

  await act(async () => fail(new Error("Website unavailable")));

  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(suggest.nextElementSibling?.textContent).toBe("Website unavailable");
  expect(suggest.nextElementSibling?.getAttribute("role")).toBe("alert");
  expect(nameInput().value).toBe("Owner A private campaign");
});

it("keeps save errors beside the save action after suggestion errors", async () => {
  await act(async () => root.render(<CampaignEditor />));
  fetchMock.mockRejectedValueOnce(new Error("Website unavailable"));
  const suggest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Suggest from website"),
  )!;
  await act(async () => suggest.click());
  fetchMock.mockRejectedValueOnce(new Error("Save unavailable"));

  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe("Save unavailable");
  expect(alert?.previousElementSibling).not.toBe(suggest);
  expect(container.textContent).not.toContain("Website unavailable");
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

it("restores local files after verified sign-in, uploads them privately, saves and opens Checkout once", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const contact = { company: "Example", contactName: "Owner", email: "owner@example.com" };
  state.readDraft.mockResolvedValue({
    ownerUserId: null, contact, billingMode: "one_time", expiresAt: Date.now() + 60000,
    fields: { title: "Local campaign", url: "https://example.com", feedDescription: "Campaign before login",
      iconId: "local-icon", wordmarkId: "local-wordmark", mediaId: "", posterId: "", videoPreviewId: "" },
    files: { icon: new File(["fixture"], "icon.png", { type: "image/png" }), wordmark: new File(["fixture"], "wordmark.png", { type: "image/png" }) },
  });
  vi.mocked(prepareAndUploadMedia).mockImplementation(async (_file, kind) => ({
    original: { id: kind + "-original" },
    primary: { id: kind + "-verified", kind: kind === "sponsor-icon" ? "icon" : "wordmark", url: "/fixture.png", width: 64, height: 64, contentType: "image/png" },
    variants: [],
  }) as never);
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, value: preparation("owner-a") }))
    .mockResolvedValueOnce(Response.json({ ok: true, value: { revision: 1, checkoutId: "owned-checkout" } }))
    .mockResolvedValueOnce(Response.json({ ok: true, value: { url: "https://checkout.stripe.com/fixture" } }));
  const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  await act(async () => root.render(<CampaignEditor />));
  expect(state.readDraft).toHaveBeenCalledWith("owner-a", "owner@example.com");
  expect(prepareAndUploadMedia).toHaveBeenCalledTimes(2);
  const save = fetchMock.mock.calls.find(([, init]) => init.method === "PUT");
  expect(JSON.parse(save![1].body)).toMatchObject({ title: "Local campaign", iconId: "sponsor-icon-verified", wordmarkId: "sponsor-wordmark-verified", contact });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("https://checkout.stripe.com/fixture");
  expect(state.clearDraft).toHaveBeenCalledOnce();
});
