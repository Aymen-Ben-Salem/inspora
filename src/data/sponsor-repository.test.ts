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
  database.select.mockReturnValueOnce(query).mockReturnValue({from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([])});

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

it.each([0, 3, 4])("adds the separate manual placement alongside %i paid campaigns without consuming a paid seat", async (count) => {
  const rows = Array.from({ length: count }, (_, index) => ({ campaign: { id: `paid-${index}`, title: "Paid", url: "https://example.com", mediaType: "image", mediaWidth: 1, mediaHeight: 1, mediaAlt: "" }, paidThrough: new Date("2099-01-01"), versionId: `version-${index}`, feedDescription: null }));
  const paid = { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(rows) };
  const manual = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "manual", title: "Editorial", url: "https://example.org", mediaType: "image", tagline: "Manual description", wordmarkUrl: "/wordmark.webp" }]) };
  database.select.mockReturnValueOnce(paid).mockReturnValueOnce(manual);
  const result = await getActiveSponsors();
  expect(result.map((row) => row.id)).toEqual([...rows.map((row) => row.campaign.id), "manual"]);
  expect(paid.limit).toHaveBeenCalledWith(4);
  const dialect = new PgDialect();
  const paidSql = dialect.sqlToQuery(paid.where.mock.calls[0][0]);
  for (const part of ['"sponsors"."campaign_state"', '"sponsor_accounts"."state"', '"sponsor_identities"."state"', '"sponsor_accounts"."paid_through" >']) expect(paidSql.sql).toContain(part);
  expect(paidSql.params).toEqual(expect.arrayContaining(["published", "active", "allowed"]));
  {
    const scope = dialect.sqlToQuery(manual.where.mock.calls[0][0]);
    for (const part of ['"owner_user_id" is null', '"account_id" is null', '"deleted_at" is null', '"created_by" is not null', '"icon_url"', '"wordmark_url"']) expect(scope.sql).toContain(part);
    expect(scope.params).toEqual(expect.arrayContaining([true, "legacy"]));
    expect(result.at(-1)).toMatchObject({feedDescription: "Manual description", wordmarkUrl: "/wordmark.webp"});
    expect(result.at(-1)).not.toHaveProperty("paidThrough");
  }
});
