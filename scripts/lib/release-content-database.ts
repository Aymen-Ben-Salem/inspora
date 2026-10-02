import type {PoolClient} from '@neondatabase/serverless';
import {captureContentSnapshot,assertSnapshotUnchanged} from './content-transfer-database';
import {canonicalHash,type ContentSnapshot,type Row} from './content-transfer-plan';
import {buildReleaseContentPlan} from './release-content-plan';
import {initializeCreatorProfiles} from './creator-profile-backfill-database';
import {planCreatorProfileBackfill} from './creator-profile-backfill';
import {quoteReleaseIdentifier as quote,runReleaseTransaction} from './release-migration-execution';

export function releaseProfilePlan(before:ContentSnapshot,plan:ReturnType<typeof buildReleaseContentPlan>,environment:'production'|'rehearsal'){
 const creators=structuredClone([...before.rows.creators,...plan.inserts.creators]);
 for(const change of plan.profileUpdates)creators.find(r=>r.id===change.id)!.username=change.username;
 const aliases=[...before.rows.creator_username_aliases,...plan.inserts.creator_username_aliases];
 const ids=new Set(creators.map(r=>String(r.id)));
 return {ids:[...ids].sort(),changes:planCreatorProfileBackfill(creators.map(r=>({id:String(r.id),name:String(r.name),handle:r.handle as string|null,username:r.username as string|null,ownerUserId:r.has_owner?'owned':null,xProviderId:r.has_verified_x?'verified':null,recordOrigin:String(r.record_origin)})),aliases.map(r=>({creatorId:String(r.creator_id),username:String(r.username),isCurrent:r.is_current===true})),{environment,creatorIds:ids})};
}

export async function applyReleaseContent(client:PoolClient,before:ContentSnapshot,plan:ReturnType<typeof buildReleaseContentPlan>,environment:'production'|'rehearsal',rollbackTest=false){
 if(rollbackTest&&environment!=='rehearsal')throw Error('Release content rollback fixture only permitted in rehearsal');
 const profiles=releaseProfilePlan(before,plan,environment);
 return runReleaseTransaction(client,async()=>{
  const tables=Object.keys(before.tableHashes).sort().map(t=>'public.'+quote(t));
  await client.query(`LOCK TABLE ${tables.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  assertSnapshotUnchanged(before,await captureContentSnapshot(client,'preview'));
  for(const table of ['creators','creator_username_aliases','logos','logo_media','websites','website_media','website_sections']){
   const rows=plan.inserts[table];if(!rows.length)continue;
   const allowed=new Set(before.schema.filter(r=>r.table_name===table).map(r=>String(r.column_name)));
   const columns=Object.keys(rows[0]);
   if(rows.some(r=>canonicalHash(Object.keys(r).sort())!==canonicalHash([...columns].sort()))||columns.some(k=>!allowed.has(k)||['owner_user_id','x_provider_id','created_by','updated_by'].includes(k)))throw Error('Release content insert columns rejected');
   const q=columns.map(quote).join(',');
   const inserted=await client.query(`insert into public.${quote(table)} (${q}) select ${q} from jsonb_populate_recordset(null::public.${quote(table)},$1::jsonb) returning id`,[JSON.stringify(rows)]);
   if(inserted.rowCount!==rows.length)throw Error('Release content unexpected inserted count');
  }
  for(const change of plan.profileUpdates){
   const result=await client.query('update creators set username=$2 where id=$1 and username is null and owner_user_id is null and x_provider_id is null',[change.id,change.username]);
   if(result.rowCount!==1)throw Error('Release content identity changed');
  }
  const initialized=await initializeCreatorProfiles(client,true,new Set(profiles.ids),{environment,actorId:'release-creator-profile-backfill'});
  if(canonicalHash(initialized.changes)!==canonicalHash(profiles.changes))throw Error('Release content initialization drift');
  if(Object.values(plan.inserts).some(rows=>rows.length)||plan.profileUpdates.length){
   for(const id of plan.selectedWorkIds)await client.query("insert into admin_audit_logs(actor_id,action,resource_type,resource_id,details) values ('release-content-transfer','release.imported',$1,$2,$3::jsonb)",[releaseAuditResourceType(id,before.rows,plan.inserts),id,JSON.stringify({environment,selectedCreatorIds:plan.selectedCreatorIds})]);
  }
  const after=await captureContentSnapshot(client,'preview');
  for(const [table,rows] of Object.entries(before.rows))for(const row of rows){
   const match=after.rows[table]?.find(r=>table==='design_categories'?r.name===row.name:r.id===row.id);
   if(!match)throw Error('Release content removed existing row');
   const changedProfile=table==='creators'&&(profiles.changes.some(r=>r.creatorId===row.id)||plan.profileUpdates.some(r=>r.id===row.id));
   for(const [key,value] of Object.entries(row)){
    if(changedProfile&&['username','updated_at'].includes(key))continue;
    if(canonicalHash(match[key])!==canonicalHash(value))throw Error('Release content changed protected existing field');
   }
  }
  const mutable=new Set(['creators','creator_username_aliases','logos','logo_media','websites','website_media','website_sections','admin_audit_logs']);
  for(const [table,hash] of Object.entries(before.tableHashes))if(!mutable.has(table)&&canonicalHash(hash)!==canonicalHash(after.tableHashes[table]))throw Error('Release content changed unrelated data');
  for(const [table,rows] of Object.entries(plan.inserts))for(const row of rows){
   const actual=after.rows[table].find(r=>r.id===row.id);
   if(!actual||Object.entries(row).some(([k,v])=>canonicalHash(actual[k])!==canonicalHash(v)))throw Error('Release content inserted row mismatch');
  }
  if(rollbackTest)throw Error('EXPECTED_RELEASE_CONTENT_ROLLBACK');
  return {initialized:initialized.changes.length,tableHashes:after.tableHashes};
 });
}

export function releaseAuditResourceType(id:string,before:Record<string,Row[]>,inserts:Record<string,Row[]>):'logo'|'website'{
 const logo=[...(before.logos??[]),...(inserts.logos??[])].some(r=>r.id===id);
 const website=[...(before.websites??[]),...(inserts.websites??[])].some(r=>r.id===id);
 if(logo===website)throw Error('Release content audit identity is missing or ambiguous');
 return logo?'logo':'website';
}
