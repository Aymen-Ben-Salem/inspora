import { afterEach, expect, it, vi } from "vitest";
import { verifyPreviewAnalyticsProject } from "./preview-configuration";
const values = {
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:"fixture-token",
  NEXT_PUBLIC_POSTHOG_HOST:"https://eu.i.posthog.com",
  POSTHOG_API_HOST:"https://eu.posthog.com",
  POSTHOG_PERSONAL_API_KEY:"fixture-read-key",
  POSTHOG_PROJECT_ID:"123",
  POSTHOG_WORK_VIEWS_CUTOVER_AT:"2026-09-21T12:00:00.000Z",
};
afterEach(() => vi.unstubAllGlobals());
it.each([{id:123,api_token:"other-token"},{id:456,api_token:"fixture-token"}])("rejects mismatched project metadata", async (project) => {
  vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify(project))));
  await expect(verifyPreviewAnalyticsProject(values)).rejects.toThrow("do not match");
});
it("verifies the server key and browser token against one project", async () => {
  vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({id:123,api_token:"fixture-token"}))));
  await expect(verifyPreviewAnalyticsProject(values)).resolves.toBeUndefined();
});
it("does not contact any project when analytics is disabled", async () => {
  const request=vi.fn(); vi.stubGlobal("fetch",request);
  await verifyPreviewAnalyticsProject({});
  expect(request).not.toHaveBeenCalled();
});
