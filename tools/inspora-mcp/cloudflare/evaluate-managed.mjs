import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {cloudflareApi} from './maintainer-api.mjs';
import {createEmbed,MODEL} from './embeddings.mjs';
import {buildCatalog} from './catalog.mjs';
import {SearchEngine} from '../search.mjs';
import {buildIndex} from '../index-builder.mjs';
import {embed as localEmbed,dispose} from '../model.mjs';
import {feedSchema} from '../feed-schema.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(process.env.INSPORA_EVALUATION_OUTPUT??path.join(dir,'../../../.scratch/inspora-cloudflare-20261114'));
fs.mkdirSync(output,{recursive:true});
const api=cloudflareApi(process.env.CLOUDFLARE_ACCOUNT_ID);
const token=process.env.INSPORA_CATALOG_TOKEN;
if(!/^[A-Za-z0-9_-]{32,128}$/.test(token??''))throw Error('Catalog-only source token required');
const response=await fetch('https://www.inspora.design/api/inspora/catalog',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Catalog source returned '+response.status);
const raw=await response.text();if(Buffer.byteLength(raw)>4*1024*1024)throw Error('Catalog too large');
const feed=feedSchema.parse(JSON.parse(raw));
fs.writeFileSync(path.join(output,'source-feed.json'),JSON.stringify(feed));
let apiCalls=0,inputBytes=0,chunks=0;
const managedEmbed=createEmbed({run:async(model,body)=>{
  if(model!==MODEL.name)throw Error('Unexpected embedding model');
  apiCalls++;if(apiCalls>200)throw Error('EVALUATION_REQUEST_CAP');
  chunks+=body.text.length;inputBytes+=body.text.reduce((sum,text)=>sum+Buffer.byteLength(text),0);
  return api('/ai/run/'+model,{method:'POST',body});
}});
const cachePath=path.join(output,'index-cloudflare.json');
const previous=fs.existsSync(cachePath)?JSON.parse(fs.readFileSync(cachePath,'utf8')):undefined;
const start=performance.now();
const index=await buildCatalog(feed,{embed:managedEmbed,previous});
fs.writeFileSync(cachePath,JSON.stringify(index));
const buildMs=performance.now()-start;
console.log(JSON.stringify({stage:'managed-index',works:index.rows.length,buildMs,apiCalls,chunks,inputBytes}));
const prior=JSON.parse(fs.readFileSync(path.join(dir,'../data/index-enriched.json'),'utf8'));
const localIndex=await buildIndex(feed.catalog,{variant:'enriched',enrichment:feed.enrichment,previous:[prior],embed:localEmbed});
const cases=JSON.parse(fs.readFileSync(path.join(dir,'../evaluation-cases.json'),'utf8'));
// Extra written requests reflect the user's website/design priority. They supplement
// the existing 20 cases and do not become independent human relevance judgments.
cases.push(...[
  ['WD01','dark SaaS landing page with oversized sans serif headlines','website'],
  ['WD02','editorial website with serif headlines and generous whitespace','website'],
  ['WD03','creative portfolio with bold typography and a grid of projects','website'],
  ['WD04','minimal dashboard with charts and financial metrics','design'],
  ['WD05','animated navigation tabs with smooth morphing transitions','design'],
  ['WD06','brand poster with condensed uppercase lettering','design'],
].map(([id,query,kind])=>({id,type:'written',input:{query,kinds:[kind]}})));
const engines={cloudflare:new SearchEngine(index,{embed:managedEmbed}),local:new SearchEngine(localIndex,{embed:localEmbed})};
const runs=[];
try{
  for(const item of cases){
    const run={id:item.id,type:item.type,input:item.input};
    for(const [name,engine] of Object.entries(engines)){
      const start=performance.now(),result=await engine.search(item.input);
      assert.ok(JSON.stringify(result).length<=12000);
      for(const row of result.results){assert.equal(row.url,engine.byId.get(row.id).url);assert.equal(row.creator,engine.byId.get(row.id).creator);}
      run[name]={durationMs:performance.now()-start,result};
    }
    const localIds=new Set(run.local.result.results.map(row=>row.id));
    run.sharedTopSix=run.cloudflare.result.results.filter(row=>localIds.has(row.id)).length;
    runs.push(run);
  }
}finally{await dispose();}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const summary={at:new Date().toISOString(),model:MODEL,works:index.rows.length,buildMs,apiCalls,chunks,inputBytes,requests:runs.length,writtenLatencyMedianMs:percentile(runs.filter(run=>run.type==='written').map(run=>run.cloudflare.durationMs),.5),writtenLatencyP95Ms:percentile(runs.filter(run=>run.type==='written').map(run=>run.cloudflare.durationMs),.95),meanSharedTopSix:runs.reduce((sum,run)=>sum+run.sharedTopSix,0)/runs.length,limitations:'Exact in-process ranking with real Workers AI REST round trips. Not hosted Worker/client latency, CPU usage or an independent usefulness score. Fixture/unit tests are separate. API request cap is not a dollar cap; published token-rate estimates are not billed usage.'};
fs.writeFileSync(path.join(output,'managed-comparison.json'),JSON.stringify({summary,cases,runs},null,2));
console.log(JSON.stringify(summary));
