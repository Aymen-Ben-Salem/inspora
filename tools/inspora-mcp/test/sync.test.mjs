import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CatalogSync,sourceUrl,fetchFeed,STALE_MS} from '../sync.mjs';import {createCatalogFeed} from '../catalog-feed.mjs';
import {work,note,embed} from './fixtures.mjs';
test('automatic snapshots add, edit and remove all work kinds; failed builds remain atomic and retry',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inspora-sync-'));let now=Date.now(),rows=['design','website','logo','icon'].map((kind,i)=>work(i+1,kind));
  const entries=rows.map(row=>note(row));let feed={version:1,catalog:{capturedAt:new Date(now).toISOString(),rows},enrichment:{version:1,entries}},fail=false,embedded=0;
  const sync=new CatalogSync({url:'http://127.0.0.1:4174/catalog',directory,now:()=>now,fetcher:async()=>new Response(JSON.stringify(feed),{headers:{'Content-Type':'application/json'}}),embed:async texts=>{embedded+=texts.length;if(fail)throw Error('Model failure');return embed(texts);}});
  try {
    await sync.tick();assert.equal(sync.index.rows.length,4);assert.equal(sync.index.enrichment.current,4);assert.equal(sync.status().stale,false);
    const firstId=sync.index.snapshotId,firstCalls=embedded;now+=1000;feed.catalog.capturedAt=new Date(now).toISOString();await sync.tick();assert.equal(sync.index.snapshotId,firstId);assert.equal(embedded,firstCalls);
    const saved=feed.catalog.rows;feed.catalog.rows=[{...rows[0],description:'Conflicting same-version data'},...rows.slice(1)];await sync.tick();assert.equal(sync.index.snapshotId,firstId);assert.equal(sync.status().failures,1);feed.catalog.rows=saved;
    now+=1000;rows=[{...rows[0],description:'A freshly edited public caption.'},...rows.slice(1),work(5)];feed.catalog={capturedAt:new Date(now).toISOString(),rows};await sync.tick();assert.equal(sync.index.rows.length,5);assert.equal(sync.index.rows[0].searchOnly,'');assert.equal(sync.index.enrichment.stale,1);assert.equal(sync.index.enrichment.missing,1);
    const old=fs.readFileSync(sync.indexFile,'utf8');now+=1000;feed.catalog={capturedAt:new Date(now).toISOString(),rows:[{...rows[0],description:'Another edit.'},...rows.slice(1)]};fail=true;await sync.tick();assert.equal(fs.readFileSync(sync.indexFile,'utf8'),old);assert.equal(sync.status().failures,1);
    fail=false;await sync.tick();assert.match(sync.index.rows[0].description,/Another edit/);assert.equal(sync.status().failures,0);
    const latest=sync.index.snapshotId;feed.catalog.capturedAt=new Date(now-1000).toISOString();await sync.tick();assert.equal(sync.index.snapshotId,latest);assert.equal(sync.status().failures,1);
    now+=1000;feed.catalog={capturedAt:new Date(now).toISOString(),rows:[{...rows[0],status:'draft'},{...rows[1],media:[]},{...rows[2],creator_visible:false},{...rows[3],published_at:'2099-01-01T00:00:00Z'}]};await sync.tick();assert.equal(sync.index.rows.length,0);assert.equal(sync.status().failures,0);
    now+=STALE_MS+1;await sync.tick();assert.equal(sync.status().stale,true);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('two clients serialize updates to their shared catalog directory',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inspora-sync-shared-'));let release;const held=new Promise(resolve=>{release=resolve;});let calls=0;
  const row=work(1),feed={version:1,catalog:{capturedAt:new Date().toISOString(),rows:[row]},enrichment:{version:1,entries:[note(row)]}};
  const options={url:'http://127.0.0.1:4174/catalog',directory,embed,fetcher:async()=>{calls++;await held;return new Response(JSON.stringify(feed),{headers:{'Content-Type':'application/json'}});}};
  const first=new CatalogSync(options),second=new CatalogSync(options);
  try{const running=first.tick();await second.tick();assert.equal(calls,1);release();await running;await second.tick();assert.equal(second.index.rows.length,1);assert.equal(fs.existsSync(first.lockFile),false);fs.writeFileSync(first.lockFile,'');const expired=new Date(Date.now()-31000);fs.utimesSync(first.lockFile,expired,expired);await second.tick();assert.equal(fs.existsSync(first.lockFile),false);}finally{release();await first.pending;fs.rmSync(directory,{recursive:true,force:true});}
});
test('feed transport rejects unsafe URLs, redirects, non-JSON and oversized responses',async()=>{
  for(const url of ['http://remote.test/catalog','https://user:secret@example.org/catalog','https://example.org/catalog?secret=1','file:///private'])assert.throws(()=>sourceUrl(url));
  await assert.rejects(fetchFeed('https://example.org/catalog',async(_url,options)=>{assert.equal(options.redirect,'error');return new Response('login page',{headers:{'content-type':'text/html'}});}),/not JSON/);
  await assert.rejects(fetchFeed('https://example.org/catalog',async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'99999999'}})),/size limit/);
});
test('loopback feed serves only its public snapshot and expires after capture failures',async()=>{
  let now=Date.now(),failed=false;const row=work(1),bridge=await createCatalogFeed({port:0,intervalMs:60000,now:()=>now,capture:async()=>{if(failed)throw Error('DB unavailable');return {capturedAt:new Date(now).toISOString(),rows:[row]};},readEnrichment:()=>({version:1,entries:[note(row)]})});
  try{
    assert.equal((await fetchFeed(bridge.url)).catalog.rows[0].id,row.id);
    assert.equal((await fetch(bridge.url.replace('/catalog','/secrets'))).status,404);
    assert.equal((await fetch(bridge.url,{method:'POST'})).status,404);
    failed=true;now+=STALE_MS+1;await bridge.refresh();assert.equal((await fetch(bridge.url)).status,503);
    failed=false;await bridge.refresh();assert.equal((await fetch(bridge.url)).status,200);
  }finally{await bridge.close();}
});
