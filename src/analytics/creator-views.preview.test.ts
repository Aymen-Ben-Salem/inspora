import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { describe, expect, it, vi } from "vitest";
import { previewEnvironmentFromValues } from "../../scripts/lib/preview-environment";
import { validatePreviewAnalytics, ANALYTICS_CONFIGURATION_KEYS } from "./preview-configuration";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({cacheLife:vi.fn(),cacheTag:vi.fn()}));

// Explicit opt-in; importing/running ordinary tests never reads credentials or sends events.
const suite = process.env.RUN_PREVIEW_VIEWS_INTEGRATION === "1" ? describe : describe.skip;
suite("isolated Preview PostHog query semantics", () => {
  it("queries the actual provider over labelled synthetic events", async () => {
    // Synthetic fixture boundary only: never select or overwrite the deployment cutover.
    const replayPath = process.env.PREVIEW_VIEWS_FIXTURE_MANIFEST;
    if (replayPath && !/^\.scratch\/task8-[0-9a-f-]+\.json$/.test(replayPath)) throw new Error("Invalid fixture manifest path");
    const replay = replayPath ? JSON.parse(readFileSync(replayPath,"utf8")) : null;
    const fixtureCutover = replay?.fixtureCutover ?? new Date(Date.now() - 60_000).toISOString();
    const values: Record<string, string> = { ...parse(readFileSync(".env.preview.local", "utf8")), POSTHOG_WORK_VIEWS_CUTOVER_AT: fixtureCutover };
    previewEnvironmentFromValues(values);
    expect(validatePreviewAnalytics(values)).toBe(true);
    expect(process.env.CONFIRMED_PREVIEW_POSTHOG_PROJECT_ID).toBe(values.POSTHOG_PROJECT_ID);
    for (const key of ANALYTICS_CONFIGURATION_KEYS) vi.stubEnv(key, values[key]);
    vi.stubEnv("DATA_ENVIRONMENT", "preview");
    try {
      const {getPostHogConfiguration, runHogQlQuery} = await import("./posthog-query");
      const {buildCreatorViewsQuery, parseCreatorViewsRows} = await import("./creator-views");
      const configuration = getPostHogConfiguration()!;
      const projectResponse = await fetch(configuration.apiHost + "/api/projects/" + configuration.projectId + "/", {
        headers:{Authorization:"Bearer " + configuration.personalApiKey}, signal:AbortSignal.timeout(10000),
      });
      expect(projectResponse.ok).toBe(true);
      const project = await projectResponse.json();
      // Assert booleans, never print either token in a failed assertion.
      expect(String(project.id) === configuration.projectId).toBe(true);
      expect(project.api_token === values.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN).toBe(true);
      const cutover = Date.parse(values.POSTHOG_WORK_VIEWS_CUTOVER_AT);
      expect(cutover < Date.now() - 1000).toBe(true);
      if (replay) expect(replay.projectId).toBe(configuration.projectId);
      const run = replay?.run ?? "task8-" + randomUUID();
      const shared = randomUUID(), second = randomUUID(), icon = randomUUID(), website = randomUUID();
      const session = randomUUID(), laterSession = randomUUID();
      const eligible = replay?.eligible ?? {design:[shared,second],logo:[shared,icon],website:[website]};
      const event = (kind:string,id:string,sessionId:string|null,legacy=false) => ({
        uuid:randomUUID(), event:legacy ? "post opened" : "work opened",
        timestamp:new Date(legacy ? cutover-1000 : cutover+1000).toISOString(),
        properties:{distinct_id:run,task8_fixture:run,$process_person_profile:false,
          ...(sessionId === null ? {} : {$session_id:sessionId}),
          ...(legacy ? {post_id:id} : {work_kind:kind,work_id:id})},
      });
      const batch = [event("design",shared,session,true),event("design",shared,session),
        event("design",shared,session),event("design",shared,laterSession),event("design",second,session),
        event("logo",shared,session),event("logo",icon,session),event("website",website,session),
        event("design",second,null),event("design",second,""),event("design",randomUUID(),session),
        {...event("logo",shared,randomUUID()),timestamp:new Date(cutover-1000).toISOString()},
        {...event("website",website,randomUUID()),timestamp:new Date(cutover-1000).toISOString()}];
      if (!replay) {
      const manifest = {run,projectId:configuration.projectId,fixtureCutover,eligible,expected:6,submittedAt:new Date().toISOString()};
      mkdirSync(".scratch", {recursive:true});
      writeFileSync(".scratch/" + run + ".json", JSON.stringify(manifest,null,2));
      console.info(JSON.stringify(manifest));
      const capture = await fetch(values.NEXT_PUBLIC_POSTHOG_HOST + "/batch/", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({api_key:values.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,batch}),signal:AbortSignal.timeout(10000),
      });
      expect(capture.ok).toBe(true);
      }
      await expect.poll(async () => parseCreatorViewsRows(await runHogQlQuery(configuration,
        buildCreatorViewsQuery(eligible,values.POSTHOG_WORK_VIEWS_CUTOVER_AT))),
        {timeout:300000,interval:10000}).toBe(6);
      expect(parseCreatorViewsRows(await runHogQlQuery(configuration,buildCreatorViewsQuery(
        {design:[],logo:[],website:[]},values.POSTHOG_WORK_VIEWS_CUTOVER_AT)))).toBe(0);
      console.info(JSON.stringify({run,observedAt:new Date().toISOString(),verifiedCount:6}));
      // Retain only these labelled synthetic events for review; never broad-delete a project.
    } finally { vi.unstubAllEnvs(); }
  }, 330000);
});
