import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { previewEnvironmentFromValues } from "./lib/preview-environment";
import {assertDataOperationEnvironment,runtimeDataEnvironmentFromValues} from './lib/environment-fingerprint';
import {releaseDatabaseFromValues,RELEASE_DATABASE_TARGETS} from './lib/release-migration';
import { renderSitemap } from "./lib/sitemap";

async function loadPublishedSlugs() {
  let databaseUrl: string;
  if(process.env.DATA_ENVIRONMENT==='production'){
    databaseUrl=releaseDatabaseFromValues(process.env,RELEASE_DATABASE_TARGETS.production,{});
  }else if(process.env.DATA_ENVIRONMENT==='rehearsal'){
    const environment=runtimeDataEnvironmentFromValues(process.env);
    assertDataOperationEnvironment(environment);
    databaseUrl=environment.databaseUrl;
  }else{
    databaseUrl=previewEnvironmentFromValues(process.env,{source:'guarded sitemap build environment'}).databaseUrl;
  }
  const sql = neon(databaseUrl);
  const rows = await sql`
    select slug
    from posts
    where status = 'published'
      and published_at <= now()
    order by created_at desc, id desc
  `;

  const creators=await sql`select c.username from creators c
    left join profile_accounts a on a.user_id=c.owner_user_id
    where c.username is not null and coalesce(lower(trim(c.handle)),'') not like 'dev-%'
      and (c.owner_user_id is null or a.status='active')
      and exists (select 1 from creator_username_aliases u where u.creator_id=c.id and u.username=c.username and u.is_current)
    order by c.username`;
  return {slugs:rows.map(row=>String(row.slug)),usernames:creators.map(row=>String(row.username))};
}

async function main() {
  const {slugs,usernames} = await loadPublishedSlugs();
  const target = resolve(process.cwd(), "public", "sitemap.xml");

  await writeFile(target, renderSitemap(slugs,usernames), "utf8");
  process.stdout.write(`Generated public/sitemap.xml with ${slugs.length + usernames.length + 4} URLs.\n`);
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`Could not generate sitemap: ${message}\n`);
  process.exitCode = 1;
});
