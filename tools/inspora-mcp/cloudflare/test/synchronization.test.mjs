import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogSync,COALESCE_MS} from '../synchronization.mjs';
import {buildCatalog,publishCatalog,createCatalogReader,FENCE_KEY,REPAIR_INTERVAL_MS} from '../catalog.mjs';
import {Bucket,Storage} from './helpers.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';

const feed=rows=>({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(row=>note(row))}});
async function fixture(){
  const bucket=new Bucket(),storage=new Storage();let current=feed([work(1),work(2),work(3)]),sourceCalls=0,failSource=false,failEmbedding=false,afterRead=()=>{};
  await publishCatalog(bucket,await buildCatalog(current,{embed}));
  const job=new CatalogSync({storage,blockConcurrencyWhile:fn=>fn()},{CATALOG:bucket},{readSource:async()=>{sourceCalls++;if(failSource)throw Error('secret source error');const snapshot=structuredClone(current);await afterRead();return snapshot;},embed:async texts=>{if(failEmbedding)throw Error('private model error');return embed(texts);}});
  return {bucket,storage,job,get sourceCalls(){return sourceCalls;},setFeed:value=>{current=value;},failSource:value=>{failSource=value;},failEmbedding:value=>{failEmbedding=value;},afterRead:fn=>{afterRead=fn;},enqueue:()=>job.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'enqueue',reason:'edit'})})),alarm:async()=>{storage.alarmAt=null;await job.alarm();}};
}

test('notifications coalesce, block known-stale reads and automatically refresh additions/removals',async()=>{
  const f=await fixture(),reader=createCatalogReader();
  assert.equal((await reader(f.bucket)).rows.length,3);
  await f.enqueue();const scheduled=f.storage.alarmAt;await f.enqueue();assert.equal(f.storage.alarmAt,scheduled);assert.ok(scheduled<=Date.now()+COALESCE_MS);
  // Existing legacy pointer has no event fence until its first managed publication.
  const changed=work(2);changed.description='A newly edited composition';
  f.setFeed(feed([{...work(1),status:'draft'},changed,work(3),work(4)]));await f.alarm();
  const index=await reader(f.bucket);assert.deepEqual(index.rows.map(row=>row.id),[changed.id,work(3).id,work(4).id]);assert.equal(index.rows[0].description,changed.description);
  assert.equal(index.delivery.repairIntervalHours,12);assert.equal(f.sourceCalls,1);
  await f.enqueue();await assert.rejects(reader(f.bucket),/UPDATING/);
  await f.alarm();assert.ok(f.storage.alarmAt>=Date.now()+REPAIR_INTERVAL_MS-1000);
});

test('embedding outage publishes safe interim rows; stale notes and ineligible works do not survive',async()=>{
  const f=await fixture(),original=work(2),changed={...original,description:'New caption invalidates the previous visual notes'};
  const updated=feed([{...work(1),creator_visible:false},changed,work(3)]);updated.enrichment.entries=feed([work(1),original,work(3)]).enrichment.entries;
  f.setFeed(updated);f.failEmbedding(true);await f.enqueue();await f.alarm();
  const interim=await createCatalogReader()(f.bucket);assert.deepEqual(interim.rows.map(row=>row.id),[work(3).id]);assert.equal(interim.delivery.pendingWorks,1);
  assert.equal((await f.storage.get('status')).state,'retrying');assert.ok(f.storage.alarmAt<Date.now()+60000);
  f.failEmbedding(false);await f.alarm();const complete=await createCatalogReader()(f.bucket);
  assert.equal(complete.rows.length,2);assert.equal(complete.rows[0].searchOnly,'');assert.equal(complete.rows[0].enrichmentStatus,'stale');
});

test('source outages retry without exposing errors and recover without a client restart',async()=>{
  const f=await fixture();await f.enqueue();await f.alarm();
  f.failSource(true);await f.enqueue();await f.alarm();
  await assert.rejects(createCatalogReader()(f.bucket),/UPDATING/);
  assert.ok(!JSON.stringify(await f.storage.get('status')).includes('secret'));
  f.failSource(false);await f.alarm();assert.equal((await createCatalogReader()(f.bucket)).rows.length,3);
});

test('an edit arriving during a build is not overwritten by an older publication',async()=>{
  const f=await fixture();await f.enqueue();await f.alarm();
  let once=true;
  f.afterRead(async()=>{if(once){once=false;f.setFeed(feed([work(3)]));await f.enqueue();}});
  await f.enqueue();await f.alarm();
  assert.equal((await (await f.bucket.get(FENCE_KEY)).json()).pending,true);
  await assert.rejects(createCatalogReader()(f.bucket),/UPDATING/);
  await f.alarm();assert.equal((await createCatalogReader()(f.bucket)).rows.length,1);
});

test('missed notifications repair on the shared alarm and the twelve-hour bound expires honestly',async()=>{
  const f=await fixture();await f.enqueue();await f.alarm();
  f.setFeed(feed([work(1)]));await f.alarm();assert.equal((await createCatalogReader()(f.bucket)).rows.length,1);
  await assert.rejects(createCatalogReader({now:()=>Date.now()+REPAIR_INTERVAL_MS+61000})(f.bucket),/STALE/);
});
