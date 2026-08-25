import { neon } from "@neondatabase/serverless";

import { loadProductionMediaEnvironment } from "./lib/production-environment";

async function main() {
  const environment = loadProductionMediaEnvironment();
  const sql = neon(environment.databaseUrlUnpooled);
  const [migrationRows, columnRows, mediaRows] = await Promise.all([
    sql`
      select count(*)::int as count, max(created_at)::bigint as latest
      from drizzle.__drizzle_migrations
    `,
    sql`
      select
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'post_media'
            and column_name = 'video_preview'
        ) as post_media_preview,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'sponsors'
            and column_name = 'media_video_preview'
        ) as sponsor_preview
    `,
    sql`
      select
        (select count(*)::int from post_media
          where type = 'video' and storage_provider = 'r2' and position = 0
        ) as post_video_count,
        (select count(*)::int from sponsors
          where media_type = 'video' and media_storage_provider = 'r2'
        ) as sponsor_video_count
    `,
  ]);
  const migrationState = migrationRows[0];
  const columnState = columnRows[0];
  const mediaState = mediaRows[0];

  console.log(`Database host: ${new URL(environment.databaseUrlUnpooled).hostname}`);
  console.log(`R2 bucket: ${environment.r2BucketName}`);
  console.log(`Applied migration rows: ${migrationState?.count ?? "unknown"}`);
  console.log(`Latest migration timestamp: ${migrationState?.latest ?? "unknown"}`);
  console.log(`post_media.video_preview: ${Boolean(columnState?.post_media_preview)}`);
  console.log(`sponsors.media_video_preview: ${Boolean(columnState?.sponsor_preview)}`);
  console.log(`Post video covers: ${mediaState?.post_video_count ?? "unknown"}`);
  console.log(`Video sponsors: ${mediaState?.sponsor_video_count ?? "unknown"}`);
}

main().catch((error) => {
  console.error("Production rollout inspection failed.", error);
  process.exitCode = 1;
});
