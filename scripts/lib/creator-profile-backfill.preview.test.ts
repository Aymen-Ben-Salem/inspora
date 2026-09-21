import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";
import { initializeCreatorProfiles } from "./creator-profile-backfill-database";
import { loadPreviewEnvironment } from "./preview-environment";

describe.skipIf(process.env.RUN_PREVIEW_CREATOR_BACKFILL_TEST !== "1")("Preview creator-profile transaction", () => {
  it("initializes only selected fixtures, preserves credit and metadata, and rolls back all fixture data", async () => {
    const preview = loadPreviewEnvironment();
    const pool = new Pool({ connectionString: preview.databaseUrl });
    const client = await pool.connect();
    const id = randomUUID();
    const existingId = randomUUID();
    const workId = randomUUID();
    const handle = "backfill_" + id.replaceAll("-", "").slice(0, 12);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '20s'");
      await client.query(`
        insert into creators (id, name, handle, avatar_url, record_origin)
        values ($1, 'Legacy preview fixture', $3, '/brand/default-avatar.svg', 'mirrored'),
          ($2, 'Existing preview fixture', $4, '/brand/default-avatar.svg', 'preview')
      `, [id, existingId, handle, handle + "_other"]);
      await client.query(`
        update creators set username = $2 where id = $1
      `, [existingId, handle + "_current"]);
      await client.query(`
        insert into creator_username_aliases (creator_id, username, is_current)
        values ($1, $2, false), ($1, $3, true)
      `, [existingId, handle, handle + "_current"]);
      await client.query(`
        insert into posts (id, slug, title, creator_id, description, category, source_url, status, published_at)
        values ($1, $2, 'Backfill fixture', $3, 'Preview only', 'Web', 'https://example.com', 'published', now())
      `, [workId, "backfill-" + id, id]);
      const snapshot = async () => (await client.query(`
        select to_jsonb(c) - 'username' - 'updated_at' as metadata from creators c where id = $1
      `, [id])).rows[0].metadata;
      const before = await snapshot();
      const scope = new Set([id, existingId]);
      const dryRun = await initializeCreatorProfiles(client, false, scope);
      expect(dryRun.changes).toEqual([
        { creatorId: id, username: handle + "_2", updateUsername: true, insertAlias: true },
      ]);
      expect((await client.query("select username from creators where id = $1", [id])).rows[0].username).toBeNull();
      expect((await initializeCreatorProfiles(client, true, scope)).changes).toEqual(dryRun.changes);
      expect(await snapshot()).toEqual(before);
      expect((await client.query(`
        select c.id, c.username, p.id as work_id from creator_username_aliases a
        join creators c on c.id = a.creator_id join posts p on p.creator_id = c.id
        where lower(a.username) = $1 and a.is_current
      `, [handle + "_2"])).rows).toEqual([{ id, username: handle + "_2", work_id: workId }]);
      expect((await initializeCreatorProfiles(client, true, scope)).changes).toEqual([]);
      expect((await client.query(`
        select username, is_current from creator_username_aliases where creator_id = $1 order by username
      `, [existingId])).rows).toEqual([
        { username: handle, is_current: false }, { username: handle + "_current", is_current: true },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
    const verificationPool = new Pool({ connectionString: preview.databaseUrl });
    try {
      const residue = await verificationPool.query("select id from creators where id = any($1::uuid[])", [[id, existingId]]);
      expect(residue.rowCount).toBe(0);
    } finally {
      await verificationPool.end();
    }
  }, 30000);
});
