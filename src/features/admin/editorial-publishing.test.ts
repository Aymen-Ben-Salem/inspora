import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ saved: [] as unknown[][], prepared: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("../inspora-catalog/notify", () => ({ notifyCatalogChanged: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("./posts-repository", () => ({ insertAdminPostInTransaction: async () => ({ id: "post-1", slug: "post" }) }));
vi.mock("./logos-repository", () => ({ insertAdminLogoInTransaction: async () => ({ id: "logo-1", slug: "logo" }) }));
vi.mock("./websites-repository", () => ({ insertAdminWebsiteInTransaction: async () => ({ id: "site-1", slug: "site" }) }));
vi.mock("./editorial-review", () => ({ saveEditorialReview: async (...args: unknown[]) => { calls.saved.push(args); } }));
import { publishReviewedWork } from "./publishing";

const review = { jobId: "job", notes: { scope: "component" }, evidence: [] };
beforeEach(() => { calls.saved = []; });

it("saves reviewed search notes in the publication transaction for every kind", async () => {
  const tx = {} as never;
  await publishReviewedWork(tx, { kind: "design", content: { title: "D" } as never, editorial: review as never }, "admin", "creator");
  await publishReviewedWork(tx, { kind: "app-icon", content: { title: "I", kind: "logo" } as never, editorial: review as never }, "admin", "creator");
  await publishReviewedWork(tx, { kind: "website", content: { title: "W" } as never }, "admin", "creator");
  expect(calls.saved.map(args => [args[1], args[2], args[5]])).toEqual([["post-1", "design", review], ["logo-1", "icon", review], ["site-1", "website", null]]);
});
