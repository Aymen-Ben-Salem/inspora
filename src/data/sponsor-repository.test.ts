import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: () => database }));
vi.mock("@/features/sponsorship/config", () => ({ sponsorshipEnabled: () => true }));
import { getActiveSponsors } from "./sponsor-repository";

beforeEach(() => { database.select.mockReset(); });

it.each(["Made for focused work.", null])("reads the website description from the current campaign version (%s)", async (feedDescription) => {
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{
      campaign: {
        id: "campaign", title: "Product", url: "https://example.com", tagline: "Existing tagline",
        iconUrl: "https://media.example.com/icon.webp", iconStorageProvider: "r2",
        mediaType: "image", mediaWidth: 1200, mediaHeight: 800, mediaAlt: "Product",
      },
      versionId: "current-version", paidThrough: new Date("2099-01-01"), feedDescription,
    }]),
  };
  database.select.mockReturnValue(query);

  const [sponsor] = await getActiveSponsors();
  expect(sponsor).toMatchObject({
    versionId: "current-version", tagline: "Existing tagline", feedDescription: feedDescription ?? undefined,
    iconUrl: "https://media.example.com/icon.webp",
  });
  const selection = database.select.mock.calls[0][0];
  const selectedDescription = new PgDialect().sqlToQuery(selection.feedDescription).sql;
  expect(selectedDescription).toBe('"sponsor_campaign_versions"."creative"->>\'feedDescription\'');
  expect(sponsor).not.toHaveProperty("creative");
});
