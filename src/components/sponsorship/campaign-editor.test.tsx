import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/sponsor/start" }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignOutButton: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("@/features/media/prepare-and-upload", () => ({
  prepareAndUploadMedia: vi.fn(),
}));
import { CampaignEditor } from "./campaign-editor";
it("allows typing before verification and shows three previews with upload and billing boundaries", () => {
  const html = renderToStaticMarkup(<CampaignEditor />);
  expect(html).toContain("Website destination");
  expect(html).toContain("Public name");
  expect(html).not.toContain("Tagline");
  expect(html).not.toContain("Sign out");
  expect(html).toContain("Full wordmark");
  expect(html).toContain("Verify sponsor access to save");
  expect(html).toContain("disabled");
  expect(html).toContain("10 MiB");
  expect(html).toContain("50 MiB");
  expect(html).toContain("Navbar · compact icon");
  expect(html).toContain("Feed · image, video or brand card");
  expect(html).toContain("Detail sidebar · full wordmark");
  expect(html).toContain("Wordmark not imported");
  expect(html).toContain('href="/sponsor/dashboard?billing=one_time"');
  expect(html).toContain("Open sponsorship dashboard");
});
