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
