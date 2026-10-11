import { z } from "zod";
import { getActiveSponsors } from "@/data/sponsor-repository";
import {
  issueDeliveryToken,
  publicAnalyticsPath,
} from "@/analytics/first-party/context";
import {
  analyticsActor,
  requestAnalyticsDisabled,
} from "@/analytics/first-party/service";
import { readAnalyticsJson } from "@/analytics/first-party/http";
import { AnalyticsInputError } from "@/analytics/first-party/collector";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};
const inputSchema = z
  .object({
    pageId: z.uuid(),
    path: z.string().max(240),
    referrerDomain: z
      .string()
      .max(253)
      .regex(/^[a-z0-9.-]+$/)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ message: "Forbidden." }, { status: 403, headers });
  if (requestAnalyticsDisabled(request))
    return Response.json({ disabled: true }, { headers });
  try {
    const input = inputSchema.parse(await readAnalyticsJson(request, 1024));
    publicAnalyticsPath(input.path);
    const actor = await analyticsActor();
    if (actor.excluded) return Response.json({ disabled: true }, { headers });
    const now = Date.now(),
      base = { ...input, issuedAt: now, expiresAt: now + 300000 };
    const sponsors = await getActiveSponsors();
    const placements = [
      "header",
      ...(["/", "/websites", "/logos"].includes(input.path) ? ["feed"] : []),
      // Website/Logo dialogs retain the archive pathname. The observer only
      // emits detail activity for a rendered sidebar, never decorative copies.
      ...(/^\/posts\/[^/]+$/.test(input.path) ||
      ["/websites", "/logos"].includes(input.path)
        ? ["detail"]
        : []),
    ] as const;
    const tokens = sponsors
      .filter((s) => s.versionId)
      .flatMap((s) =>
        placements.map((value) => {
          const placement = value as "header" | "feed" | "detail";
          return {
            campaignId: s.id,
            versionId: s.versionId!,
            placement,
            token: issueDeliveryToken({
              ...base,
              campaignId: s.id,
              versionId: s.versionId!,
              placement,
              previewVideo:
                placement === "feed" &&
                s.mediaType === "video" &&
                Boolean(s.mediaVideoPreview),
            }),
          };
        }),
      );
    return Response.json(
      {
        pageToken: issueDeliveryToken(base),
        tokens,
        expiresAt: base.expiresAt,
        serverTime: now,
      },
      { headers },
    );
  } catch (error) {
    const invalid =
      error instanceof AnalyticsInputError || error instanceof z.ZodError;
    return Response.json(
      {
        message: invalid
          ? "Invalid public analytics context."
          : "Analytics context unavailable.",
      },
      { status: invalid ? 400 : 503, headers },
    );
  }
}
