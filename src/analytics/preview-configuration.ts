export const ANALYTICS_CONFIGURATION_KEYS = [
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_API_HOST",
  "POSTHOG_WORK_VIEWS_CUTOVER_AT",
] as const;

// No credentials is an explicitly unavailable state; partial setup is unsafe.
export function validatePreviewAnalytics(values: Record<string, string | undefined>) {
  if (!ANALYTICS_CONFIGURATION_KEYS.some((key) => values[key]?.trim())) return false;
  for (const key of ANALYTICS_CONFIGURATION_KEYS) {
    if (!values[key]?.trim()) throw new Error(`${key} is missing from Preview analytics configuration.`);
  }
  const region = ["us", "eu"].find(
    (region) => values.NEXT_PUBLIC_POSTHOG_HOST === `https://${region}.i.posthog.com`
      && values.POSTHOG_API_HOST === `https://${region}.posthog.com`,
  );
  if (!region) throw new Error("Preview PostHog ingestion and API hosts must use the same supported region.");
  if (!/^\d+$/.test(values.POSTHOG_PROJECT_ID!)) throw new Error("Preview PostHog project ID must be numeric.");
  const cutover = values.POSTHOG_WORK_VIEWS_CUTOVER_AT!;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(cutover) || !Number.isFinite(Date.parse(cutover))) {
    throw new Error("Preview PostHog cutover must be a fixed UTC timestamp.");
  }
  return true;
}

// Verify server read access and browser ingestion point to exactly the same project.
export async function verifyPreviewAnalyticsProject(values: Record<string, string | undefined>) {
  if (!validatePreviewAnalytics(values)) return;
  const response = await fetch(values.POSTHOG_API_HOST + "/api/projects/" + values.POSTHOG_PROJECT_ID + "/", {
    headers: { Authorization: "Bearer " + values.POSTHOG_PERSONAL_API_KEY },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Preview PostHog project read verification failed.");
  const project = await response.json();
  if (String(project?.id) !== values.POSTHOG_PROJECT_ID || project?.api_token !== values.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    throw new Error("Preview PostHog ingestion token and server project do not match.");
  }
}
