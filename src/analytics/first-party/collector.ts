import "server-only";
import { z } from "zod";
import { isPrivateAnalyticsPath } from "@/analytics/privacy";
import {
  EVENT_KINDS,
  type AcceptedBatch,
  type AcceptedEvent,
  type DeliveryContext,
  type VisitorContext,
} from "./types";
const eventSchema = z
  .object({
    occurrenceId: z.uuid(),
    kind: z.enum(EVENT_KINDS),
    occurredAt: z.iso.datetime(),
    token: z.string().min(1).max(2048),
    milestone: z
      .union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)])
      .optional(),
  })
  .strict();
const batchSchema = z
  .object({ events: z.array(eventSchema).min(1).max(20) })
  .strict();
export class AnalyticsInputError extends Error {}
export function createAnalyticsCollector(deps: {
  now(): Date;
  decode(token: string): DeliveryContext;
  visitor(request: Request, now: Date): Promise<VisitorContext>;
  allowed(
    request: Request,
    context: DeliveryContext,
    occurredAt: Date,
  ): Promise<boolean>;
  store(events: AcceptedEvent[]): Promise<AcceptedBatch>;
}) {
  return async (request: Request, input: unknown): Promise<AcceptedBatch> => {
    if (Buffer.byteLength(JSON.stringify(input) ?? "") > 20480)
      throw new AnalyticsInputError("Batch too large.");
    const parsed = batchSchema.safeParse(input);
    if (!parsed.success)
      throw new AnalyticsInputError("Invalid analytics batch.");
    const now = deps.now(),
      accepted: AcceptedEvent[] = [],
      excluded: string[] = [];
    const visitors = new Map<string, VisitorContext>();
    for (const event of parsed.data.events) {
      const at = Date.parse(event.occurredAt),
        context = deps.decode(event.token);
      if (
        at < now.getTime() - 900000 ||
        at > now.getTime() + 5000 ||
        at < context.issuedAt - 5000 ||
        at > context.expiresAt ||
        now.getTime() > context.expiresAt + 900000
      )
        throw new AnalyticsInputError("Expired analytics context.");
      if (
        isPrivateAnalyticsPath(context.path) ||
        (event.kind === "site_page_view") !== !context.campaignId ||
        (event.kind === "sponsor_preview_progress") !==
          (event.milestone !== undefined) ||
        (event.kind.startsWith("sponsor_preview") &&
          (context.placement !== "feed" || !context.previewVideo))
      )
        throw new AnalyticsInputError("Invalid event context.");
      if (!(await deps.allowed(request, context, new Date(at)))) {
        excluded.push(event.occurrenceId);
        continue;
      }
      const month = event.occurredAt.slice(0, 7);
      let visitor = visitors.get(month);
      if (!visitor) {
        visitor = await deps.visitor(request, new Date(at));
        visitors.set(month, visitor);
      }
      accepted.push({
        ...event,
        ...context,
        ...visitor,
        referrerDomain: context.referrerDomain ?? visitor.referrerDomain,
      });
    }
    const result = accepted.length
      ? await deps.store(accepted)
      : { accepted: [], duplicate: [], excluded: [] };
    return { ...result, excluded: [...result.excluded, ...excluded] };
  };
}
