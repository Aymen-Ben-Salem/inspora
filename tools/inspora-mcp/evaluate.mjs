import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {SearchEngine} from './search.mjs';
import {embed, dispose, MODEL} from './model.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const option=(key,fallback)=>{const at=process.argv.indexOf(key);return at<0?fallback:path.resolve(process.argv[at+1]);};
const data=option('--data',path.join(root,'data'));
const output=option('--output',path.join(root,'evaluation-results'));
const cases=JSON.parse(fs.readFileSync(path.join(root,'evaluation-cases.json'),'utf8'));
assert.equal(cases.length,20);
globalThis.fetch=async()=>{throw Error('Network disabled in local evaluation');};
const vectors=new Map();
const cachedEmbed=async texts=>Promise.all(texts.map(async text=>{if(!vectors.has(text))vectors.set(text,embed([text]).then(v=>v[0]));return vectors.get(text);}));
const started=performance.now(),coldStart=performance.now();
await cachedEmbed([cases[0].input.query]);
const coldModelAndFirstQueryMs=performance.now()-coldStart;
const runs=[];
const variants=['original','enriched'];
try {
  for(const variant of variants) {
    const index=JSON.parse(fs.readFileSync(path.join(data,'index-'+variant+'.json'),'utf8'));
    for(const ranking of ['lexical','semantic','hybrid']) {
      const engine=new SearchEngine(index,{embed:cachedEmbed,ranking});
      for(const c of cases) {
        const start=performance.now(),result=await engine.search({...c.input,count:6});
        const durationMs=performance.now()-start,serialized=JSON.stringify(result);
        assert.ok(serialized.length<=12000);
        assert.equal(new Set(result.results.map(r=>r.id)).size,result.results.length);
        for(const item of result.results) {
          const source=engine.byId.get(item.id);
          assert.equal(item.creator,source.creator);assert.equal(item.url,source.url);
        }
        if(result.next_cursor) {
          const next=await engine.search({cursor:result.next_cursor});
          assert.ok(next.results.every(r=>!result.results.some(first=>first.id===r.id)));
        }
        runs.push({caseId:c.id,inputType:c.type,variant,ranking,snapshotId:index.snapshotId,capturedAt:index.capturedAt,durationMs,outputChars:serialized.length,estimatedOutputTokens:Math.ceil(serialized.length/4),usefulCount:null,result});
      }
      const absent=await engine.search({query:'a lunar ceramics inventory',required_terms:['absent-catalog-sentinel-9fa3'],count:6});
      assert.equal(absent.results.length,0);assert.equal(absent.insufficient_matches,true);
    }
  }
} finally {await dispose();}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const summaries=[];
for(const variant of variants)for(const ranking of ['lexical','semantic','hybrid'])for(const type of ['written','reference']) {
  const subset=runs.filter(r=>r.variant===variant&&r.ranking===ranking&&r.inputType===type);
  summaries.push({variant,ranking,inputType:type,requests:subset.length,latencyMedianMs:percentile(subset.map(r=>r.durationMs),.5),latencyP95Ms:percentile(subset.map(r=>r.durationMs),.95),meanOutputChars:Math.round(subset.reduce((s,r)=>s+r.outputChars,0)/subset.length),sixResultRequests:subset.filter(r=>r.result.results.length===6).length});
}
const report={at:new Date().toISOString(),model:MODEL,coldModelAndFirstQueryMs,elapsedMs:performance.now()-started,tokenMethod:'Output character count / 4 only; estimate, not measured provider usage. Host context/tool schemas/reasoning excluded.',latencyMethod:'In-process local retrieval. Model initialized once; repeated query embeddings cached across comparisons. Cold startup reported separately. Not client round-trip latency.',qualityGate:'Pending independent team review: at least 4 useful results among 6 on at least 16 of 20 requests. Missing results count as not useful. This developer-prepared set is not a blind holdout; content and query overlap may bias comparison.',cases,summaries,runs};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected=runs.filter(r=>r.variant==='enriched'&&r.ranking==='hybrid');
const cards=selected.map(r=>{const c=cases.find(c=>c.id===r.caseId);return `<article><small>${c.id} · ${c.type}</small><h2>${escape(c.intent)}</h2><p>${escape(c.input.query||c.input.reference_url)}</p><ol>${r.result.results.map(item=>`<li><a href="${escape(item.url)}" target="_blank" rel="noopener">${escape(item.title)}</a> — ${escape(item.creator)}<p>${escape(item.reason)}</p></li>`).join('')}</ol><p>${escape(r.result.notice)}</p><label>Useful results (0–${r.result.results.length}): <select data-case="${c.id}"><option value="">Not reviewed</option>${Array.from({length:r.result.results.length+1},(_,n)=>`<option>${n}</option>`).join('')}</select></label><p><textarea data-notes="${c.id}" placeholder="Explain useful matches, mismatches, credit or link problems" rows="3"></textarea></p></article>`;}).join('');
fs.writeFileSync(path.join(output,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Inspora 20-request review</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:48px auto;padding:0 24px;color:#262626}article{border-top:1px solid #ddd;padding:28px 0}h2{font-size:23px}small,li p{color:#666}li p{margin:0 0 12px}textarea{width:100%;font:inherit}select,button{font:inherit;padding:8px}a{color:#1647a8}#progress{position:sticky;top:0;background:white;padding:12px 0;border-bottom:1px solid #ddd}</style><h1>Twenty real requests</h1><p>Search-enriched hybrid results. Open the references and judge whether each would help the stated design task. Count useful results; fewer than six returned still has a denominator of six. Check visual relevance, links and creator credit. Alternatives must be judged on their stated limitations.</p><p>${escape(report.qualityGate)}</p><p>This review stays in this page until you export it. No scores are sent anywhere.</p><p id="progress">0/20 reviewed</p><button id="export">Export review JSON</button>${cards}<script>const selects=[...document.querySelectorAll('select')];function update(){const done=selects.filter(x=>x.value!=='');const pass=done.filter(x=>Number(x.value)>=4);document.getElementById('progress').textContent=done.length+'/20 reviewed · '+pass.length+'/20 have at least four useful results'+(done.length===20?' · '+(pass.length>=16?'relevance threshold met by your scores':'relevance threshold not met'):'');}selects.forEach(x=>x.addEventListener('change',update));document.getElementById('export').onclick=()=>{const review=selects.map(x=>({caseId:x.dataset.case,usefulCount:x.value===''?null:Number(x.value),notes:document.querySelector('[data-notes="'+x.dataset.case+'"]').value}));const url=URL.createObjectURL(new Blob([JSON.stringify({at:new Date().toISOString(),variant:'enriched',ranking:'hybrid',review},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='inspora-team-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};</script></html>`);
console.log(JSON.stringify({output,requests:cases.length,comparisonRuns:runs.length,coldModelAndFirstQueryMs,quality:'pending team review',summaries},null,2));
