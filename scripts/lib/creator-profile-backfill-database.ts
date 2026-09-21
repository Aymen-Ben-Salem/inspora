import type { PoolClient } from "@neondatabase/serverless";
import { planCreatorProfileBackfill, type BackfillAlias, type BackfillCreator } from "./creator-profile-backfill";

// Caller owns the transaction. Apply takes a brief table lock so namespace
// allocation cannot race an admin edit, account creation or another backfill.
export async function initializeCreatorProfiles(
  client: PoolClient,
  apply: boolean,
  creatorIds?: ReadonlySet<string>,
) {
  if (apply) {
    await client.query("LOCK TABLE creators, creator_username_aliases IN SHARE ROW EXCLUSIVE MODE");
  }
  const read = async () => {
    const creators = await client.query<BackfillCreator>(`
      select id, name, handle, username, owner_user_id as "ownerUserId",
        x_provider_id as "xProviderId", record_origin as "recordOrigin" from creators
    `);
    const aliases = await client.query<BackfillAlias>(`
      select creator_id as "creatorId", username, is_current as "isCurrent" from creator_username_aliases
    `);
    return { creators: creators.rows, aliases: aliases.rows };
  };
  const before = await read();
  const inScope = (row: { creatorId: string }) => !creatorIds || creatorIds.has(row.creatorId);
  const plan = planCreatorProfileBackfill(before.creators, before.aliases).filter(inScope);
  if (apply && plan.length) {
    const payload = JSON.stringify(plan);
    const changed = await client.query(`
      update creators c set username = p.username, updated_at = now()
      from jsonb_to_recordset($1::jsonb) as p("creatorId" uuid, username text, "updateUsername" boolean)
      where c.id = p."creatorId" and p."updateUsername" and c.username is null
      returning c.id
    `, [payload]);
    if (changed.rowCount !== plan.filter((row) => row.updateUsername).length) {
      throw new Error("Creator backfill changed unexpectedly; transaction must roll back.");
    }
    await client.query(`
      insert into creator_username_aliases (creator_id, username, is_current)
      select p."creatorId", p.username, true
      from jsonb_to_recordset($1::jsonb) as p("creatorId" uuid, username text, "insertAlias" boolean)
      where p."insertAlias"
    `, [payload]);
    await client.query(`
      insert into admin_audit_logs (actor_id, action, resource_type, resource_id, details)
      select 'preview-creator-profile-backfill', 'creator.profile_initialized', 'creator',
        p."creatorId", jsonb_build_object('username', p.username, 'environment', 'preview')
      from jsonb_to_recordset($1::jsonb) as p("creatorId" uuid, username text)
    `, [payload]);
    const after = await read();
    if (planCreatorProfileBackfill(after.creators, after.aliases).some(inScope)) {
      throw new Error("Creator backfill is incomplete; transaction must roll back.");
    }
  }
  return { inspected: before.creators.length, changes: plan };
}
