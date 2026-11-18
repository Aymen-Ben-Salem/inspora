// Search revision 13: only explicit arguments filter, aliases are equivalents, context is
// a separate per-result field, inflections only expand requested words, and capitalised
// references are not keywords (synthetic fixtures).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work,embed,vector,evidencedIds} from './fixtures.mjs';

const flat=works=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'r13',capturedAt,rows},{embed});};

test('a subject read from the wording ranks while an explicit subject filters',async()=>{
 const poster={...work(1),title:'Gig poster',description:'A clean gig poster with bold type.'};
 const card={...work(2),title:'Profile card',description:'A clean profile card with bold type.'};
 const e=flat([poster,card]);
 const inferred=await e.search({query:'clean bold poster'});
 assert.deepEqual(inferred.results.map(r=>[r.id,r.match]),[[poster.id,'subject'],[card.id,'brief']]);
 assert.deepEqual(inferred.interpreted_query.derived_constraints.enforced,['kinds'],'only the kind section read from wording filters');
 assert.deepEqual((await e.search({query:'clean bold poster',subjects:['poster']})).results.map(r=>r.id),[poster.id]);
});

test('a concept alias is an equivalent name and a narrower concept falls back to its parent',async()=>{
 const toggle={...work(1),title:'Switch',description:'A toggle flips dark mode.'};
 const nav={...work(2),title:'Top bar',description:'A navigation bar with five links.'};
 const side={...work(3),title:'Panel',description:'A sidebar lists pages.'};
 const e=flat([toggle,nav,side]);
 assert.deepEqual(evidencedIds(await e.search({query:'toggle switch',subjects:['toggle switch']})),[toggle.id]);
 const sidebar=await e.search({query:'sidebar',subjects:['sidebar'],kinds:['design']});
 assert.deepEqual(sidebar.results.map(r=>[r.id,r.match]),[[side.id,'subject'],[nav.id,'broader']]);
 assert.deepEqual(sidebar.interpreted_query.subject_fallbacks,['navigation']);
 assert.ok(evidencedIds(await e.search({query:'navigation',subjects:['navigation'],kinds:['design']})).includes(side.id),'a sidebar is navigation');
});

test('context is reported per result and orders subject matches',async()=>{
 const fit={...work(1),title:'Run board',description:'A dashboard of runs.',industries:['Fitness']};
 const plain={...work(2),title:'Sales board',description:'A dashboard of sales.'};
 const result=await flat([plain,fit]).search({query:'dashboard',subjects:['dashboard'],context:'fitness'});
 assert.deepEqual(result.results.map(r=>[r.id,r.match,r.evidence.context]),[[fit.id,'subject',{matched:['fitness']}],[plain.id,'subject',{unverified:['fitness']}]]);
});

test('inflections only expand requested base words',async()=>{
 const sending={...work(1),title:'Transfer',description:'A sending animation confirms a transfer.'};
 const books={...work(2),title:'Shelf',description:'A shelf of books.'};
 const e=flat([sending,books]);
 assert.ok((await e.search({query:'send money animation'})).results.some(r=>r.id===sending.id));
 assert.ok(!(await e.search({query:'booking shelf'})).results.some(r=>r.id===books.id&&r.evidence.brief_terms?.matched?.includes('booking')),'a requested "booking" never matches "book"');
});

test('a capitalised style reference is reported and never matched literally',async()=>{
 const striped={...work(1),title:'Stripes',description:'A striped poster in black and white.'};
 const gradient={...work(2),title:'Glow',description:'A vibrant gradient poster.'};
 const result=await flat([striped,gradient]).search({query:'Stripe-style vibrant gradient poster'});
 assert.deepEqual(result.interpreted_query.derived_constraints.reference_brands,['Stripe']);
 assert.equal(result.results[0].id,gradient.id);
 assert.ok(!/stripe/.test(result.results.find(r=>r.id===striped.id)?.reason??''),'no literal stripe evidence');
});

test('a related taxonomy label is reported as related-domain evidence and weaker subject evidence never precedes the subject',async()=>{
 const keyed=text=>{const t=text.toLowerCase();return t==='banking'?[.95,.3,0,0]:/financ/.test(t)?[.9,.43,0,0]:/sport/.test(t)?[0,1,0,0]:/music/.test(t)?[0,0,1,0]:/travel/.test(t)?[0,0,0,1]:[.1,.1,.1,.98];};
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(380).fill(0)];};
 const capturedAt=new Date().toISOString();
 const works=[{...work(1),title:'Ledger',description:'A dashboard of balances.',industries:['Finance']},{...work(2),title:'Board',description:'A dashboard of tasks.',industries:['Sports']},
  {...work(3),title:'Mixer',description:'A music panel.',industries:['Music']},{...work(4),title:'Trip',description:'A trip planner with a small dashboard.',industries:['Travel']},
  {...work(5),title:'Bank card',description:'A banking card list beside a dashboard.'}];
 const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:unit([.3,.3,.3,.9])}));
 const result=await new SearchEngine({snapshotId:'close',capturedAt,rows},{embed:async texts=>texts.map(text=>unit(keyed(text)))}).search({query:'dashboard',subjects:['dashboard'],kinds:['design'],context:'banking'});
 const byId=Object.fromEntries(result.results.map(r=>[r.id,r]));
 assert.deepEqual(byId[works[0].id].evidence.context,{unverified:['banking'],related_domain:'Finance'});
 assert.equal(result.interpreted_query.close_context_labels,undefined,'no close-synonym verdict');
 const subjectRows=result.results.map(r=>['subject','contains'].includes(r.match));
 assert.ok(subjectRows.indexOf(false)<0||subjectRows.slice(subjectRows.indexOf(false)).every(x=>!x),'no subject match after weaker subject evidence');
 assert.ok(result.results.findIndex(r=>r.id===works[0].id)<result.results.findIndex(r=>r.id===works[1].id),'related-domain evidence ranks first');
});

test('a context-matched supporting-feature work ranks before context-unverified subject matches',async()=>{
 const boards=[1,2,3].map(n=>({...work(n),title:'Board '+n,description:'A dashboard of sales.'}));
 const fit={...work(9),title:'Run cards',description:'Fitness cards sit beside a small dashboard of runs.',industries:['Fitness']};
 const result=await flat([...boards,fit]).search({query:'fitness dashboard',subjects:['dashboard'],context:'fitness'});
 assert.equal(result.results[0].id,fit.id);
 assert.deepEqual([result.results[0].match,result.results[0].evidence.context],['contains',{matched:['fitness']}]);
 assert.ok(result.results.slice(1).every(r=>r.match==='subject'&&r.evidence.context.unverified));
});
