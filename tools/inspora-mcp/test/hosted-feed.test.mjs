import test from 'node:test';import assert from 'node:assert/strict';
import {createHostedFeed,CATALOG_HOST,CATALOG_PATH} from '../hosted-feed.mjs';
import {fetchFeed} from '../sync.mjs';import {work,note} from './fixtures.mjs';
const token='test_catalog_access_12345678901234567890';
const url='https://'+CATALOG_HOST+CATALOG_PATH;
const request=(address=url,options={})=>new Request(address,{headers:{Authorization:'Bearer '+token},...options});
test('hosted catalog authenticates before reading, excludes ineligible works and orphan notes, fails closed',async()=>{
  let reads=0,fail=false;const rows=['design','website','logo','icon'].map((kind,i)=>work(i+1,kind));
  const serve=createHostedFeed({token,capture:async()=>{reads++;if(fail)throw Error('secret connection');return {capturedAt:new Date().toISOString(),rows};},readEnrichment:async()=>({version:1,entries:rows.map(row=>note(row))})});
  assert.equal((await serve(new Request(url))).status,401);assert.equal(reads,0);
  for(const address of [url+'?x=1',url.replace(CATALOG_PATH,'/admin'),url.replace(CATALOG_HOST,'inspora-catalog-preview.vercel.app')])assert.equal((await serve(request(address))).status,404);
  assert.equal((await serve(request(url,{method:'POST'}))).status,404);assert.equal(reads,0);
  const feed=await fetchFeed(url,async(address,options)=>serve(new Request(address,options)),token);
  assert.equal(feed.catalog.rows.length,4);assert.equal(feed.enrichment.entries.length,4);
  rows[1].media=[];rows[2].creator_visible=false;rows[3].status='draft';
  const updated=await (await serve(request())).json();assert.equal(updated.catalog.rows.length,1);assert.equal(updated.enrichment.entries.length,1);
  fail=true;const unavailable=await serve(request());assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('secret'));
});
test('hosted catalog rejects malformed/stale snapshots and missing configuration without caching',async()=>{
  const serve=createHostedFeed({token,capture:async()=>({capturedAt:new Date(0).toISOString(),rows:[]}),readEnrichment:async()=>({version:1,entries:[]})});
  const result=await serve(request());assert.equal(result.status,503);assert.match(result.headers.get('cache-control'),/no-store/);
  assert.equal((await createHostedFeed({capture:async()=>{throw Error('must not read');},readEnrichment:async()=>null})(request())).status,503);
  await assert.rejects(fetchFeed(url,async()=>{throw Error('must not fetch');},'bad\nheader'),/Invalid catalog access token/);
});
