import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

import { seedPosts } from "../src/data/seed-posts";
import { renderSitemap } from "./lib/sitemap";

config({ path: ".env.production.local", quiet: true });
config({ path: ".env.local", quiet: true });

async function loadPublishedSlugs() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return seedPosts.map((post) => post.slug);

  const sql = neon(connectionString);
  const rows = await sql`
    select slug
    from posts
    where status = 'published'
      and published_at <= now()
    order by created_at desc, id desc
  `;

  return rows.map((row) => String(row.slug));
}

async function main() {
  const slugs = await loadPublishedSlugs();
  const target = resolve(process.cwd(), "public", "sitemap.xml");

  await writeFile(target, renderSitemap(slugs), "utf8");
  process.stdout.write(`Generated public/sitemap.xml with ${slugs.length + 1} URLs.\n`);
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`Could not generate sitemap: ${message}\n`);
  process.exitCode = 1;
});
