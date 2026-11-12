import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {buildIndex,writeAtomic} from '../index-builder.mjs';import {work,note,id,embed} from './fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const end=Date.now()+12000;while(Date.now()<end){if(await check())return;await sleep(80);}throw Error('Automatic client update exceeded the test deadline');}

test('one running MCP client receives additions, edits, eligibility removals and retry recovery without restart',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inspora-live-client-'));let rows=['design','website','logo','icon'].map((kind,i)=>work(i+1,kind)),entries=rows.map(row=>note(row));
  let feed={version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries}},unavailable=false;
  const initial=await buildIndex(feed.catalog,{enrichment:feed.enrichment,embed});writeAtomic(path.join(directory,'index-enriched.json'),initial);
  const source=http.createServer((_req,res)=>{res.writeHead(unavailable?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify(feed));});
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const client=new Client({name:'inspora-sync-acceptance',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'server.mjs'),'--data',directory,'--ranking','lexical'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,INSPORA_CATALOG_URL:`http://127.0.0.1:${source.address().port}/catalog`,INSPORA_SYNC_POLL_MS:'1000'},stderr:'pipe'});
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});return {error:result.isError===true,data:JSON.parse(result.content[0].text)};};
  const publish=()=>{feed={version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries}};};
  const started=Date.now();
  try {
    await client.connect(transport);await until(async()=>Boolean((await call('catalog_status')).data.synchronization.lastSuccessAt));
    assert.equal((await call('get_work',{id:id(1)})).data.search_only,note(rows[0]).visualNotes);
    const added=work(5);rows=[...rows,added];entries=[...entries,note(added)];publish();
    await until(async()=>!(await call('get_work',{id:added.id})).error);
    rows=rows.map(row=>row.id===id(1)?{...row,description:'A changed caption from the source.'}:row);publish();
    await until(async()=>{const result=await call('get_work',{id:id(1)});return result.data.description==='A changed caption from the source.'&&result.data.search_only==='';});
    const changedStatus=(await call('catalog_status')).data;assert.equal(changedStatus.enrichment.stale,1);
    rows=rows.map(row=>row.kind==='website'?{...row,media:[]}:row.kind==='logo'?{...row,creator_visible:false}:row.kind==='icon'?{...row,status:'draft'}:row);publish();
    await until(async()=>{const status=(await call('catalog_status')).data;return status.counts.website===0&&status.counts.logo===0&&status.counts.icon===0;});
    for(const number of [2,3,4])assert.equal((await call('get_work',{id:id(number)})).error,true);
    rows=rows.filter(row=>row.id!==id(1));publish();await until(async()=>(await call('get_work',{id:id(1)})).error);
    unavailable=true;await until(async()=>Boolean((await call('catalog_status')).data.synchronization.lastError));
    assert.equal((await call('get_work',{id:added.id})).error,false);
    unavailable=false;rows=rows.map(row=>row.id===added.id?{...row,description:'Recovered after a temporary feed outage.'}:row);publish();
    await until(async()=>(await call('get_work',{id:added.id})).data.description==='Recovered after a temporary feed outage.');
    feed.catalog.capturedAt=new Date(Date.now()-60000).toISOString();await until(async()=>Boolean((await call('catalog_status')).data.synchronization.lastError));
    assert.equal((await call('get_work',{id:added.id})).data.description,'Recovered after a temporary feed outage.');
    publish();await until(async()=>!(await call('catalog_status')).data.synchronization.lastError);
    assert.ok(Date.now()-started<30000);console.log(JSON.stringify({runningClient:'one stdio session',source:'HTTP fixture, no database writes',tested:['addition','public edit','stale enrichment omission','creator hidden','website incomplete','unpublish','deletion','outage/retry','out-of-order/recovery'],elapsedMs:Date.now()-started}));
  }finally{await client.close();await new Promise(resolve=>source.close(resolve));fs.rmSync(directory,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
