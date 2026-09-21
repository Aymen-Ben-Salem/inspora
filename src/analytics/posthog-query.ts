import "server-only";

import { z } from "zod";

import { resolvePostHogApiHost } from "./posthog-data";

const queryResponseSchema = z.object({
  results: z.array(z.array(z.unknown())),
});

export type PostHogConfiguration = {
  apiHost: string;
  personalApiKey: string;
  projectId: string;
};

export type HogQlQueryRequest = {
  name: string;
  query: string;
  values?: Record<string, unknown>;
};

export function getPostHogConfiguration(): PostHogConfiguration | null {
  const apiHost = resolvePostHogApiHost({
    apiHost: process.env.POSTHOG_API_HOST,
    ingestionHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (!apiHost || !personalApiKey || !projectId) return null;
  return { apiHost, personalApiKey, projectId };
}

export function isPostHogConfigured() {
  return getPostHogConfiguration() !== null;
}

export async function runHogQlQuery(
  configuration: PostHogConfiguration,
  request: HogQlQueryRequest,
) {
  const response = await fetch(
    `${configuration.apiHost}/api/projects/${encodeURIComponent(configuration.projectId)}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.personalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          name: request.name,
          query: request.query,
          values: request.values,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`PostHog query failed with status ${response.status}.`);
  }

  const parsed = queryResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("PostHog returned an unexpected response.");
  return parsed.data.results;
}
