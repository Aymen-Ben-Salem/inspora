import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, it, vi } from "vitest";
import { previewEnvironmentFromValues } from "../../scripts/lib/preview-environment";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({cacheLife:vi.fn(),cacheTag:vi.fn()}));
vi.mock("./posthog-query", () => ({
  getPostHogConfiguration: () => ({apiHost:"https://eu.posthog.com",projectId:"280536",personalApiKey:"fixture-only"}),
  runHogQlQuery: async () => { throw new Error("Isolated worker provider failure"); },
}));

it.skipIf(process.env.RUN_PREVIEW_VIEWS_WORKER !== "1")("reads the persisted fixture snapshot without the parent process cache", async () => {
  const path = process.env.PREVIEW_VIEWS_WORKER_MANIFEST ?? "";
  if (!/^\.scratch\/task8-worker-[0-9a-f-]+\.json$/.test(path)) throw new Error("Invalid worker fixture path");
  const fixture = JSON.parse(readFileSync(path,"utf8"));
  const values = parse(readFileSync(".env.preview.local","utf8"));
  previewEnvironmentFromValues(values);
  if (values.POSTHOG_PROJECT_ID !== "280536") throw new Error("Wrong Preview project");
  for (const key of ["DATA_ENVIRONMENT","DATABASE_URL","DATABASE_URL_UNPOOLED","R2_BUCKET_NAME","R2_PUBLIC_BASE_URL","R2_SUBMISSIONS_BUCKET_NAME","NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"]) {
    vi.stubEnv(key,values[key]);
  }
  vi.stubEnv("POSTHOG_WORK_VIEWS_CUTOVER_AT",fixture.cutover);
  try {
    const { getCreatorViews } = await import("./creator-views");
    expect(fixture.expected.status).toBe("available");
    expect(await getCreatorViews(fixture.creatorId)).toEqual(fixture.expected);
  } finally { vi.unstubAllEnvs(); }
},20000);
