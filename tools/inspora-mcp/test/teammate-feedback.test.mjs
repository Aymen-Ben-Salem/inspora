import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {tokens,queryIntent} from '../relevance.mjs';
import {work,embed,vector} from './fixtures.mjs';
function engine(works,options={}) {const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'teammate-feedback',capturedAt,rows},{embed,...options});}

test('general landing-page wording can retrieve websites without padding specific missing constraints',async()=>{
 const website={...work(1,'website'),title:'Studio Index',description:'A minimal studio website presents projects and services.'};
 const unrelated={...work(2,'design'),title:'Navigation bar',description:'A minimal navigation bar opens a menu.'};
 const ornate={...work(3,'website'),title:'Ornate campaign',description:'A retro promotional website uses ornamental illustrations and bold headlines.'};
 const e=engine([website,unrelated,ornate]);
 assert.equal((await e.search({query:'landing page',kinds:['website']})).results.length,2);
 for(const query of ['minimal landing pages','minimal website','minimal homepage'])assert.deepEqual((await e.search({query,kinds:['website']})).results.map(r=>r.id),[website.id],query);
 assert.equal((await e.search({query:'purple submarine landing page',kinds:['website']})).results.length,0);
});

test('category and categories filter the same taxonomy across work kinds',async()=>{
 const rows=[{...work(1),category:'Motion',title:'Motion study',description:'A motion study animates abstract shapes.'},{...work(2,'logo'),categories:['Lettermark'],description:'A lettermark logo uses geometric letters.'}];
 const e=engine(rows);
 for(const name of ['Motion','Lettermark']){const a=await e.search({query:name,filters:{category:[name]}});const b=await e.search({query:name,filters:{categories:[name]}});assert.ok(a.results.length);assert.deepEqual(a.results.map(r=>r.id),b.results.map(r=>r.id));}
});

test('service acronyms remain intact and explicit subject aliases are deduplicated',()=>{
 assert.ok(tokens('SaaS').includes('saas'));assert.ok(!tokens('SaaS').includes('saa'));
 const intent=queryIntent({subjects:['sign in','login','sign-in']},'sign in',new Set());assert.deepEqual(intent.subjects,['login']);
});

test('singular/plural negative terms exclude the same works',async()=>{
 const rows=[{...work(1),title:'Liquid glass buttons',description:'A row of liquid glass buttons.'},{...work(2),title:'Glass card',description:'A liquid glass profile card.'}];
 const e=engine(rows);
 for(const args of [{exclude_terms:['button']},{exclude_terms:['buttons']},{query:'glass without button'}]){const r=await e.search({query:'glass',...args});assert.deepEqual(r.results.map(x=>x.id),[rows[1].id]);}
});

test('response-limited pages say why they return fewer than requested and preserve continuation',async()=>{
 const rows=Array.from({length:24},(_,i)=>({...work(i+1),title:'Glass card '+i,description:'A glass card with a layered geometric panel. '.repeat(6)}));
 const e=engine(rows,{responseChars:3000});const first=await e.search({query:'glass card',count:20});
 assert.ok(first.results.length<20);assert.equal(first.page_limited_by,'response_size');assert.equal(first.insufficient_matches,false);assert.ok(first.next_cursor);
 const next=await e.search({cursor:first.next_cursor,count:20});assert.ok(next.results.every(r=>!first.results.some(p=>p.id===r.id)));
});

test('website kind survives descriptive design wording and equivalent compound subjects',async()=>{
 const website={...work(1,'website'),title:'Studio Index',description:'A minimal studio website presents projects and services.'};
 const e=engine([website]);
 for(const args of [{query:'Find landing page designs',kinds:['website']},{query:'landing page',kinds:['website'],subjects:['website landing page']},{query:'landing-page website designs',kinds:['website'],subjects:['landing page website']}]){
  const result=await e.search(args);assert.deepEqual(result.results.map(r=>r.id),[website.id],JSON.stringify(args));
 }
});

test('conjoined adjectives do not promote a supporting feature into an alternative main subject',async()=>{
 const target={...work(1),title:'AI agent dashboard',description:'A dark blue AI agent dashboard organizes tasks with a chat panel.',industries:['AI agents']};
 const horse={...work(2),title:'Pixel horse',description:'A blue pixel horse runs beneath a clean chat composer.',industries:['AI']};
 const unrelated={...work(3),title:'Sleep dashboard',description:'A clean blue dashboard organizes sleep tasks.',industries:['Health']};
 const e=engine([target,horse,unrelated]);
 const result=await e.search({query:'Find clean and minimal AI agent dashboard UI with a clear chat interface and task workflow, dark background, blue accents'});
 assert.deepEqual(result.interpreted_query.subjects,['dashboard']);
 assert.deepEqual(result.results.map(r=>r.id),[target.id]);
});

test('long conversational briefs retain a specific topic across style and motion wording',async()=>{
 const targets=[{...work(1),title:'Agent dashboard',description:'A clean modern dashboard shows AI agent tasks.',industries:['AI agents']},{...work(2),title:'Agent status',description:'A clean status indicator shows an AI agent thinking.',industries:['AI agents']}];
 const noise=[{...work(3),title:'AI keychain',description:'A clean modern keychain has a clear charm.',industries:['AI']},{...work(4),title:'A shark',description:'A modern blue shark illustration uses clear outlines.'}];
 const e=engine([...targets,...noise]);
 for(const query of ['AI agent interface','I need inspiration for an AI agent interface that feels clean modern and professional with clear hierarchy and subtle motion']){
  const result=await e.search({query});assert.deepEqual(new Set(result.results.map(r=>r.id)),new Set(targets.map(r=>r.id)),query);
 }
});

test('payment interfaces exclude decorative payment cards and pricing plans',async()=>{
 const checkout={...work(1),title:'Checkout form',description:'A checkout form collects delivery and payment details.'};
 const payment={...work(2),title:'Payment links',description:'A payment-link modal shows a copyable URL and sharing controls.'};
 const card={...work(3),title:'Shader credit card',description:'A payment card has a decorative flowing shader.'};
 const plan={...work(4),title:'Payment plans',description:'A payment-plan component lists a monthly price and features.'};
 const e=engine([checkout,payment,card,plan]);
 const exact=await e.search({query:'checkout'});assert.deepEqual(exact.results.map(r=>r.id),[checkout.id]);
 const payments=await e.search({query:'payment'});assert.ok(payments.results.some(r=>r.id===payment.id));assert.ok(payments.results.every(r=>![card.id,plan.id].includes(r.id)));
 const either=await e.search({query:'checkout or payment UI'});assert.deepEqual(new Set(either.results.map(r=>r.id)),new Set([checkout.id,payment.id]));
});

test('negative lists retain every excluded subject and remove them from positive interpretation',async()=>{
 const target={...work(1),title:'Clean dashboard',description:'A clean dashboard organizes metrics.'};
 const horse={...work(2),title:'Horse dashboard',description:'A clean dashboard has a pixel horse mascot.'};
 const shark={...work(3),title:'Shark dashboard',description:'A clean dashboard has a shark illustration.'};
 const e=engine([target,horse,shark]);
 const result=await e.search({query:'clean dashboards without sharks or horses'});assert.deepEqual(result.results.map(r=>r.id),[target.id]);
});

test('unambiguous ordinary typos preserve the intended artifact and expose corrections',async()=>{
 const icon={...work(1,'icon'),title:'Geometric icon',description:'A minimal geometric app icon.'};
 const other={...work(2),title:'Geometric cards',description:'Minimal geometric cards organize statistics.'};
 const e=engine([icon,other]);
 for(const query of ['minmal geometric app icnos','minimal geometric app icnos','minmal app icnos']){
  const result=await e.search({query});assert.deepEqual(result.results.map(r=>r.id),[icon.id],query);assert.ok(result.interpreted_query.corrections?.length);
 }
 const named=await e.search({query:'"Minmal" geometric app icons'});assert.ok(!named.interpreted_query.corrections?.some(c=>/minmal/i.test(c.from)));
 const brand=await e.search({query:'Blake geometric app icons'});assert.ok(!brand.interpreted_query.corrections?.some(c=>c.from==='Blake'));
});

test('uninterpretable untranslated input requests a rewrite rather than declaring catalog exhaustion',async()=>{
 const button={...work(1),title:'Blue glass button',description:'A blue glass button opens a menu.'};
 let embeddingCalls=0;const e=engine([button],{embed:async t=>{embeddingCalls++;return embed(t);}});
 for(const query of ['boutons en verre bleu','\u0623\u0632\u0631\u0627\u0631 \u0632\u062c\u0627\u062c\u064a\u0629 \u0632\u0631\u0642\u0627\u0621'])await assert.rejects(e.search({query}),/QUERY_REWRITE_REQUIRED/);
 assert.equal(embeddingCalls,0);
 assert.deepEqual((await e.search({query:'blue glass buttons'})).results.map(r=>r.id),[button.id]);
 assert.equal((await e.search({query:'purple submarine websites'})).results.length,0,'a genuine English shortage stays an empty result');
});
