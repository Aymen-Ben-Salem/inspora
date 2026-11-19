// Search revision 12 (contract updated for revision 15 evidence): honest labels, alias substitutions, semantic confirmation of broader
// evidence, related-domain context and no kind-word errors (synthetic fixtures).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work,embed,vector} from './fixtures.mjs';

const MATCHES=['subject','contains','broader','similar','related','brief','browse'];
const flat=works=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'r12',capturedAt,rows},{embed});};
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
const spread=works=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}));return new SearchEngine({snapshotId:'r12-spread',capturedAt,model:{name:'Xenova/all-MiniLM-L6-v2'},rows},{embed});};
const filler=n=>Array.from({length:n},(_,i)=>[{...work(200+i),title:'Filler '+i,description:'A small study of shapes number '+i+'.'},.05+.002*i]);

test('a kind word inside explicit kinds is a subject with a note, never an error',async()=>{
 const mark={...work(1),title:'Mark reveal',description:'An animated logo reveal draws a geometric mark.'};
 const card={...work(2),title:'Card',description:'An animated card flips.'};
 const result=await flat([mark,card]).search({query:'animated logo reveal',kinds:['design']});
 assert.match(result.interpreted_query.kind_note,/logo/);
 assert.equal(result.results[0].id,mark.id);
});

test('every match tier comes from one vocabulary and evidence counts decide the shortage flag',async()=>{
 const e=flat([{...work(1),title:'Chart',description:'A revenue chart.'},{...work(2),title:'Board',description:'A dashboard shows a weekly chart.'},{...work(3,'logo'),title:'Mark',description:'A bold mark.'}]);
 for(const args of [{query:'chart'},{query:'bold logo',kinds:['logo']},{query:'chart',context:'aviation'},{query:'logos',kinds:['logo']}]){
  const result=await e.search(args);
  assert.ok(result.results.every(r=>MATCHES.includes(r.match)),JSON.stringify(args));
  const evidenced=result.search_coverage.subject_matches??result.search_coverage.brief_matches;
  assert.equal(typeof evidenced,'number');
  assert.equal(result.insufficient_matches,evidenced<10);
  assert.ok(result.results.every(r=>!/direct/.test(JSON.stringify(r.evidence))),'the tool never claims a direct match');
 }
 const missing=await e.search({query:'chart',context:'aviation'});
 assert.ok(missing.results.every(r=>r.evidence.context.unverified?.[0]==='aviation'&&!r.evidence.context.matched));
 assert.equal(missing.search_coverage.context_matches,0);
});

test('a narrower alias keeps literal subject evidence and reports the broader concept',async()=>{
 const side={...work(1),title:'Side panel',description:'A sidebar lists project pages.'};
 const tabs={...work(2),title:'Tabs',description:'A tab bar switches between sections.'};
 const result=await flat([side,tabs]).search({query:'sidebar',subjects:['sidebar'],kinds:['design']});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[side.id,'subject'],[tabs.id,'broader']]);
 assert.deepEqual(result.interpreted_query.subject_fallbacks,['navigation']);
 const both=await flat([side,tabs]).search({query:'navigation',subjects:['navigation','sidebar'],kinds:['design']});
 assert.ok(both.results.every(r=>r.match==='subject'),'a concept also requested by name is not narrowed');
});

test('a soft context never becomes a mandatory topic',async()=>{
 const food={...work(1,'logo'),title:'Bistro',description:'A bold logo.',industries:['Food & Drink']};
 const other={...work(2,'logo'),title:'Studio',description:'A bold logo.'};
 const result=await flat([food,other]).search({query:'bold logo for a food and drink brand',kinds:['logo'],context:'food and drink'});
 assert.equal(result.interpreted_query.topic_constraints,undefined);
 assert.deepEqual(result.results.map(r=>[r.id,r.evidence.context]),[[food.id,{matched:['food','drink']}],[other.id,{unverified:['food','drink']}]]);
});

test('a product-role context counts role evidence without repeating the role in the query',async()=>{
 const app={...work(1,'website'),title:'Metrics',description:'A software product website with pricing plans and product screenshots.'};
 const result=await flat([app,{...work(2,'website'),title:'Bakery',description:'A bakery website.'}]).search({query:'landing page for an analytics startup',kinds:['website'],context:'SaaS'});
 assert.equal(result.results[0].id,app.id);
 assert.equal(result.search_coverage.context_matches,1);
});

// Revision 19: a compound domain word (fintech) reaches the label its stem begins (Finance) as the
// domain itself; other close labels (Banking) stay related-domain evidence.
test('related taxonomy labels are disclosed as related-domain evidence, not context matches',async()=>{
 const keyed=text=>{const t=text.toLowerCase();return t==='fintech'?[.9,.44,0]:/financ/.test(t)?[.8,.6,0]:/bank/.test(t)?[.7,.7,0]:/sport/.test(t)?[0,1,0]:/music/.test(t)?[0,0,1]:[.1,.1,.99];};
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(381).fill(0)];};
 const relEmbed=async texts=>texts.map(text=>unit(keyed(text)));
 const capturedAt=new Date().toISOString();
 const works=[{...work(1,'logo'),title:'Coin',description:'A minimal logo.',industries:['Finance']},{...work(2,'logo'),title:'Ball',description:'A minimal logo.',industries:['Sports']},{...work(3,'logo'),title:'Note',description:'A minimal logo.',industries:['Music']},{...work(4,'logo'),title:'Vault',description:'A minimal logo.',industries:['Banking']}];
 const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:unit([.3,.3,.9])}));
 const result=await new SearchEngine({snapshotId:'related',capturedAt,rows},{embed:relEmbed}).search({query:'minimal logo',kinds:['logo'],context:'fintech'});
 const related=result.interpreted_query.related_context_labels??[];
 assert.ok(!related.includes('Finance')&&!related.includes('Music'));
 assert.equal(result.search_coverage.context_matches,1);
 assert.equal(result.results[0].title,'Coin');
 assert.deepEqual(result.results[0].evidence.context,{matched:['fintech']});
 assert.deepEqual(result.results.find(item=>item.title==='Note').evidence.context,{unverified:['fintech']});
});

test('a broader concept inside a phrase needs affinity with the full phrase',async()=>{
 const media=[{...work(1),title:'Deck',description:'A media player shows playback controls.'},.9];
 const sport=[{...work(2),title:'Court',description:'A basketball player dribbles across a court.'},.2];
 const result=await spread([media,sport,...filler(120)]).search({query:'music player',subjects:['music player'],kinds:['design']});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[media[0].id,'broader']]);
});

test('a hard filter that leaves no more than a page keeps those works with their evidence',async()=>{
 const only={...work(1,'website'),title:'Igloo',description:'An immersive studio website.',technologies:['Svelte']};
 const result=await flat([only,work(2,'website')]).search({query:'e-commerce website built with Svelte',kinds:['website'],filters:{technologies:['Svelte']}});
 assert.deepEqual(result.results.map(r=>r.id),[only.id]);
 assert.deepEqual(result.interpreted_query.unmatched_terms,['commerce']);
 assert.match(result.notice,/Not found in any work's text \(ranking only\): commerce/);
});
