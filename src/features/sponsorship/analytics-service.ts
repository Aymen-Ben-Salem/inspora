import "server-only";
import { z } from "zod";
import type { SponsorActor } from "./types";
import type {
  MetricsFilter,
  ReportResult,
} from "@/analytics/first-party/query";
export const metricsFilterSchema = z
  .object({
    range: z.enum(["1d", "7d", "30d"]),
    campaignId: z.uuid().optional(),
    versionId: z.uuid().optional(),
    placement: z.enum(["header", "feed", "detail"]).optional(),
    country: z
      .string()
      .regex(/^(?:[A-Z]{2}|Unknown)$/)
      .optional(),
    periodId: z.uuid().optional(),
  })
  .strict();
export function createSponsorAnalyticsService(deps: {
  actor(): Promise<SponsorActor>;
  owns(actor: SponsorActor, filter: MetricsFilter): Promise<boolean>;
  read(
    actor: SponsorActor,
    filter: MetricsFilter,
    refresh: boolean,
  ): Promise<ReportResult>;
}) {
  return async (input: unknown, refresh = false): Promise<ReportResult> => {
    const actor = await deps.actor();
    if (["revoked", "deleting"].includes(actor.state))
      throw new Error("Sponsor report access denied.");
    const filter = metricsFilterSchema.parse(input);
    if (!(await deps.owns(actor, filter)))
      throw new Error("Owned report filter required.");
    return deps.read(actor, filter, refresh);
  };
}
