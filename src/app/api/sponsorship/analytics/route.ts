import {
  readOwnAnalyticsCatalog,
  readOwnSponsorMetrics,
} from "@/features/sponsorship/analytics";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      filter = Object.fromEntries(
        [...params].filter(([key]) => key !== "refresh" && key !== "catalog"),
      );
    if (!filter.range) filter.range = "30d";
    const data = await readOwnSponsorMetrics(
      filter,
      params.get("refresh") === "1",
    );
    return Response.json(
      {
        data,
        ...(params.get("catalog") === "1"
          ? { catalog: await readOwnAnalyticsCatalog() }
          : {}),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { message: "Sponsor report access unavailable." },
      { status: 403, headers },
    );
  }
}
