import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { parse } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import {
  creators,
  logoMedia,
  logos,
  websiteMedia,
  websites,
  websiteSections,
} from "../src/db/schema";
import {
  devLogoFixtures,
  devWebsiteFixtures,
  type DevLogoFixture,
  type DevWebsiteFixture,
} from "./dev-archive-fixtures";
import { assertDevelopmentDatabase } from "./dev-seed-safety";

const developmentEnv = parse(readFileSync(".env.local", "utf8"));
const productionEnv = parse(readFileSync(".env.production.local", "utf8"));
const developmentUrl =
  developmentEnv.DATABASE_URL_UNPOOLED ?? developmentEnv.DATABASE_URL;
const productionUrl =
  productionEnv.DATABASE_URL_UNPOOLED ?? productionEnv.DATABASE_URL;
const target = assertDevelopmentDatabase(developmentUrl, productionUrl);
const dryRun = process.argv.includes("--dry-run");

if (!developmentUrl) {
  throw new Error("Development database URL is required before seeding.");
}

const actorId = "dev-archive-seed";
const sql = neon(developmentUrl);
const database = drizzle({ client: sql });

type FixtureCreator =
  | DevLogoFixture["creator"]
  | DevWebsiteFixture["creator"];

async function saveCreator(creator: FixtureCreator) {
  const [existing] = await database
    .select({ id: creators.id })
    .from(creators)
    .where(eq(creators.handle, creator.handle))
    .limit(1);

  if (existing) {
    const [updated] = await database
      .update(creators)
      .set({
        avatarStorageKey: null,
        avatarStorageProvider: null,
        avatarUrl: creator.avatarUrl,
        name: creator.name,
        url: creator.url,
        updatedAt: new Date(),
      })
      .where(eq(creators.id, existing.id))
      .returning({ id: creators.id });
    if (!updated) throw new Error(`Could not update seed creator: ${creator.handle}`);
    return updated.id;
  }

  const [inserted] = await database
    .insert(creators)
    .values({
      avatarUrl: creator.avatarUrl,
      handle: creator.handle,
      name: creator.name,
      url: creator.url,
    })
    .returning({ id: creators.id });
  if (!inserted) throw new Error(`Could not create seed creator: ${creator.handle}`);
  return inserted.id;
}

async function seedLogo(fixture: DevLogoFixture) {
  const creatorId = await saveCreator(fixture.creator);
  const publishedAt = new Date(fixture.createdAt);
  const [saved] = await database
    .insert(logos)
    .values({
      archivedAt: null,
      colors: fixture.colors,
      createdAt: publishedAt,
      createdBy: actorId,
      creatorId,
      description: fixture.description,
      industry: fixture.industry,
      kind: fixture.kind,
      publishedAt,
      shape: fixture.shape,
      slug: fixture.slug,
      sourceUrl: fixture.sourceUrl,
      status: "published",
      styles: fixture.styles,
      title: fixture.title,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: logos.slug,
      set: {
        archivedAt: null,
        colors: fixture.colors,
        createdAt: publishedAt,
        creatorId,
        description: fixture.description,
        industry: fixture.industry,
        kind: fixture.kind,
        publishedAt,
        shape: fixture.shape,
        sourceUrl: fixture.sourceUrl,
        status: "published",
        styles: fixture.styles,
        title: fixture.title,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    })
    .returning({ id: logos.id });
  if (!saved) throw new Error(`Could not seed logo: ${fixture.slug}`);

  await database
    .insert(logoMedia)
    .values({
      alt: fixture.media.alt,
      height: fixture.media.height,
      logoId: saved.id,
      mimeType: "image/svg+xml",
      sourceMimeType: "image/svg+xml",
      url: fixture.media.url,
      width: fixture.media.width,
    })
    .onConflictDoUpdate({
      target: logoMedia.logoId,
      set: {
        alt: fixture.media.alt,
        height: fixture.media.height,
        mimeType: "image/svg+xml",
        sourceMimeType: "image/svg+xml",
        storageKey: null,
        storageProvider: null,
        url: fixture.media.url,
        variants: [],
        width: fixture.media.width,
      },
    });
}

async function seedWebsite(fixture: DevWebsiteFixture) {
  const creatorId = await saveCreator(fixture.creator);
  const publishedAt = new Date(fixture.createdAt);
  const [saved] = await database
    .insert(websites)
    .values({
      archivedAt: null,
      categories: fixture.categories,
      colors: fixture.colors,
      createdAt: publishedAt,
      createdBy: actorId,
      creatorId,
      description: fixture.description,
      isFeatured: fixture.isFeatured,
      publishedAt,
      slug: fixture.slug,
      sourceUrl: fixture.sourceUrl,
      status: "published",
      tagline: fixture.tagline,
      themes: fixture.themes,
      title: fixture.title,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: websites.slug,
      set: {
        archivedAt: null,
        categories: fixture.categories,
        colors: fixture.colors,
        createdAt: publishedAt,
        creatorId,
        description: fixture.description,
        isFeatured: fixture.isFeatured,
        publishedAt,
        sourceUrl: fixture.sourceUrl,
        status: "published",
        tagline: fixture.tagline,
        themes: fixture.themes,
        title: fixture.title,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    })
    .returning({ id: websites.id });
  if (!saved) throw new Error(`Could not seed website: ${fixture.slug}`);

  for (const [role, media] of [
    ["full_page", fixture.fullPage],
    ["favicon", fixture.favicon],
  ] as const) {
    await database
      .insert(websiteMedia)
      .values({
        alt: media.alt,
        height: media.height,
        mimeType: "image/svg+xml",
        role,
        sourceMimeType: "image/svg+xml",
        url: media.url,
        websiteId: saved.id,
        width: media.width,
      })
      .onConflictDoUpdate({
        target: [websiteMedia.websiteId, websiteMedia.role],
        set: {
          alt: media.alt,
          height: media.height,
          mimeType: "image/svg+xml",
          sourceMimeType: "image/svg+xml",
          storageKey: null,
          storageProvider: null,
          url: media.url,
          width: media.width,
        },
      });
  }

  for (const section of fixture.sections) {
    await database
      .insert(websiteSections)
      .values({ websiteId: saved.id, ...section })
      .onConflictDoUpdate({
        target: [websiteSections.websiteId, websiteSections.position],
        set: {
          height: section.height,
          label: section.label,
          top: section.top,
          updatedAt: new Date(),
        },
      });
  }
}

async function verifySeededRecords() {
  const [counts] = await sql`
    select
      (select count(*)::int from logos where slug like 'dev-sample-%' and kind = 'logo') as logos,
      (select count(*)::int from logos where slug like 'dev-sample-%' and kind = 'icon') as icons,
      (select count(*)::int from logos where slug like 'dev-sample-%' and kind = 'logo' and status = 'published' and published_at <= now()) as visible_logos,
      (select count(*)::int from logos where slug like 'dev-sample-%' and kind = 'icon' and status = 'published' and published_at <= now()) as visible_icons,
      (select count(*)::int from logos l where l.slug like 'dev-sample-%' and exists (select 1 from logo_media m where m.logo_id = l.id)) as logos_with_media,
      (select count(*)::int from websites where slug like 'dev-sample-%') as websites,
      (select count(*)::int from websites where slug like 'dev-sample-%' and status = 'published' and published_at <= now()) as visible_websites,
      (select count(*)::int from websites where slug like 'dev-sample-%' and is_featured = true) as featured_websites,
      (select count(*)::int from websites w where w.slug like 'dev-sample-%' and exists (select 1 from website_media m where m.website_id = w.id and m.role = 'full_page') and exists (select 1 from website_media m where m.website_id = w.id and m.role = 'favicon')) as websites_with_media,
      (select count(*)::int from website_sections s join websites w on w.id = s.website_id where w.slug like 'dev-sample-%') as website_sections
  `;
  const expected = {
    featured_websites: devWebsiteFixtures.filter((item) => item.isFeatured).length,
    icons: devLogoFixtures.filter((item) => item.kind === "icon").length,
    logos: devLogoFixtures.filter((item) => item.kind === "logo").length,
    logos_with_media: devLogoFixtures.length,
    visible_icons: devLogoFixtures.filter((item) => item.kind === "icon").length,
    visible_logos: devLogoFixtures.filter((item) => item.kind === "logo").length,
    visible_websites: devWebsiteFixtures.length,
    website_sections: devWebsiteFixtures.reduce(
      (total, item) => total + item.sections.length,
      0,
    ),
    websites: devWebsiteFixtures.length,
    websites_with_media: devWebsiteFixtures.length,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (Number(counts?.[key]) !== value) {
      throw new Error(
        `Development seed verification failed for ${key}: expected ${value}, received ${counts?.[key] ?? "missing"}.`,
      );
    }
  }

  console.log(
    `Verified ${expected.visible_logos} feed-visible logos, ${expected.visible_icons} feed-visible icons, ${expected.logos_with_media} logo media records, ${expected.visible_websites} feed-visible websites, ${expected.websites_with_media * 2} website media records, ${expected.website_sections} website sections, and ${expected.featured_websites} featured websites.`,
  );
}

async function main() {
  const summary =
    `${devLogoFixtures.filter((item) => item.kind === "logo").length} logos, ` +
    `${devLogoFixtures.filter((item) => item.kind === "icon").length} icons, and ` +
    `${devWebsiteFixtures.length} websites`;

  console.log(
    `Verified development target ${target.host}/${target.database}; production endpoint differs.`,
  );
  if (dryRun) {
    console.log(`Dry run: would upsert ${summary}. No database writes were made.`);
    return;
  }

  for (const fixture of devLogoFixtures) await seedLogo(fixture);
  for (const fixture of devWebsiteFixtures) await seedWebsite(fixture);
  console.log(`Seeded ${summary} into the development database.`);
  await verifySeededRecords();
}

main().catch((error: unknown) => {
  console.error("Development archive seed failed:", error);
  process.exitCode = 1;
});
