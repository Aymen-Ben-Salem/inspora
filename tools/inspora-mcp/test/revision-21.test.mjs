// Search revision 21 (synthetic fixtures), from the November 19 team plugin test: a kind word
// inside an interface or motion phrase no longer excludes designs, an industry filter reads a
// website's categories, details omit empty taxonomy fields, synonyms side by side name one
// concept, everyday component synonyms (to-do list, KPI card, segmented control) are concepts,
// and searches that find too few works are recorded identity-free for maintainers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {queryIntent} from '../relevance.mjs';
import {CatalogSync,LEGACY_SEARCH_PREFIX} from '../cloudflare/synchronization.mjs';
import {work,embed,vector} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r21',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});

test('revision 21 is current',()=>assert.ok(SEARCH_REVISION>=21));

test('an icon named as part of an interface element also searches designs',async()=>{
 const button={...work(1),title:'Send button',description:'A send button morphs into a paper plane on click.'};
 const icon={...work(2,'icon'),title:'Paper',description:'A paper plane app icon.'};
 const result=await flat([button,icon]).search({query:'send button icon animation'});
 assert.deepEqual([...result.interpreted_query.kinds].sort(),['design','icon']);
 assert.equal(result.results[0].id,button.id);
 for(const [query,kinds] of [['camera app icon',['icon']],['logo for a dashboard app',['logo']],['settings icon',['icon']]]){
  const other=await flat([button,icon]).search({query});
  assert.deepEqual(other.interpreted_query.kinds,kinds,query);
 }
 const motion=await flat([button,icon]).search({query:'logo reveal animation'});
 assert.ok(motion.interpreted_query.kinds.includes('design')&&motion.interpreted_query.kinds.includes('logo'));
 // Explicit kinds stay a hard filter.
 const explicit=await flat([button,icon]).search({query:'send button icon animation',kinds:['icon']});
 assert.deepEqual(explicit.interpreted_query.kinds,['icon']);
 assert.ok(explicit.results.every(r=>r.kind==='icon'));
});

test('an industry filter reads a website\'s categories, not a design\'s category',async()=>{
 const site={...work(1,'website'),title:'Agent site',categories:['AI','Development']};
 const design={...work(2),title:'Motion piece',category:'AI',industries:[]};
 const designAI={...work(3),title:'AI design',industries:['AI']};
 const engine=flat([site,design,designAI]);
 const websites=await engine.search({query:'website',kinds:['website'],filters:{industries:['AI']}});
 assert.deepEqual(websites.results.map(r=>r.id),[site.id]);
 const designs=await engine.search({query:'design',kinds:['design'],filters:{industries:['AI']}});
 assert.deepEqual(designs.results.map(r=>r.id),[designAI.id]);
 assert.equal(websites.interpreted_query.unavailable_filter_values,undefined);
});

test('details omit taxonomy fields a work does not have',()=>{
 const site={...work(1,'website'),categories:['AI'],themes:['Minimal']};
 const tags=flat([site]).details({id:site.id}).tags;
 assert.deepEqual(tags.categories,['AI']);
 assert.deepEqual(tags.themes,['Minimal']);
 for(const empty of ['industries','styles','industry','shape','category'])assert.equal(tags[empty],undefined,empty);
});

test('synonyms of one concept side by side name it once',()=>{
 for(const query of ['push notification toast','notification toast','toast notification'])
  assert.deepEqual(queryIntent({query},query,new Set()).subjects,['notification'],query);
});

test('everyday component synonyms are concepts with broader fallbacks',async()=>{
 for(const [phrase,concept] of [['to do list','checklist'],['todo list','checklist'],['task progress','checklist'],['kpi card','metric card'],['stat card','metric card'],['segmented control','tabs'],['profile picture','avatar'],['kanban board','kanban'],['trace waterfall','agent trace']])
  assert.deepEqual(queryIntent({query:phrase},phrase,new Set()).subjects,[concept],phrase);
 const list={...work(1),title:'Project card',description:'A project card expands into a checklist with a remaining-task count.'};
 const bar={...work(2),title:'Progress bar',description:'A thin progress bar fills as an upload completes.'};
 const result=await flat([list,bar]).search({query:'task progress'});
 assert.deepEqual(result.interpreted_query.subjects,['checklist']);
 assert.ok(result.interpreted_query.subject_fallbacks.includes('progress'));
 assert.equal(result.results[0].id,list.id);
 assert.ok(result.results.some(r=>r.id===bar.id),'progress stays reachable as the broader reading');
 // A plain progress request is unchanged: the checklist is not progress evidence.
 const plain=await flat([list,bar]).search({query:'progress bar'});
 assert.equal(plain.results[0].id,bar.id);
});

test('searches are not recorded and status removes records kept by an earlier revision',async()=>{
 const store=new Map([[LEGACY_SEARCH_PREFIX+'2026-11-19T00:00:00.000Z:abc',{query:'wellness logo'}],['status',{state:'ready'}]]);
 const storage={get:async k=>store.get(k),put:async(k,v)=>{store.set(k,v);},delete:async keys=>{for(const k of [keys].flat())store.delete(k);},list:async({prefix})=>new Map([...store].filter(([k])=>k.startsWith(prefix)))};
 const sync=new CatalogSync({storage},{},{readSource:async()=>{throw Error('unused');},embed:async()=>[]});
 const reply=await (await sync.fetch(new Request('https://sync.internal/',{method:'POST',body:JSON.stringify({action:'status'})}))).json();
 assert.deepEqual(reply,{state:'ready'});
 assert.deepEqual([...store.keys()],['status']);
 assert.equal((await sync.fetch(new Request('https://sync.internal/',{method:'POST',body:JSON.stringify({action:'shortage',entry:{query:'x'}})}))).status,400);
 assert.deepEqual([...store.keys()],['status']);
});

test('soft shadows and gradients are rendering, not a calm work',async()=>{
 const {moodSoft}=await import('../search.mjs');
 assert.equal(moodSoft('A chrome bubble with soft gradients, soft shadows and a soft 3D finish.'),false);
 assert.equal(moodSoft('Soft terminals and soft drop shadows.'),false);
 assert.equal(moodSoft('A soft blue rounded square holds a wave mark.'),true);
 assert.equal(moodSoft('Soft shadows frame a soft, airy layout.'),true);
});

test('a context part naming no catalog domain is reported as ranking only',async()=>{
 const agents={...work(1),title:'Agent dashboard',description:'An AI agents dashboard with run counts.',industries:['AI']};
 const result=await flat([agents,{...work(2),title:'Other dashboard',description:'A sales dashboard.'}]).search({query:'dashboard',kinds:['design'],subjects:['dashboard'],context:'AI agents, Japan'});
 assert.ok(result.search_coverage.context_ranked_only.includes('Japan'));
 assert.match(result.notice,/Japan names no catalog domain/);
});

test('nationality adjectives are no reference brands and British spellings are read',async()=>{
 const result=await flat([work(1)]).search({query:'interface with Japanese typography and warm colours',kinds:['design']});
 assert.equal(result.interpreted_query.derived_constraints?.reference_brands,undefined);
 assert.ok(!(result.interpreted_query.unmatched_terms??[]).includes('colour'));
});

test('a tab bar falls back to navigation, not to tabs',async()=>{
 const {subjectFallbacks}=await import('../relevance.mjs');
 assert.deepEqual(subjectFallbacks('tab bar'),['navigation']);
});

test('a bold or bright work is not calm because part of it is soft',async()=>{
 const loud={...work(1,'logo'),title:'Loud',description:'A bold B in a soft purple and bright orange gradient.'};
 const heavy={...work(2,'logo'),title:'Heavy',description:'A heavy wordmark with soft curves.',styles:['Bold']};
 const quiet={...work(3,'logo'),title:'Quiet',description:'A soft blue rounded square holds a gentle wave mark.'};
 const engine=flat([loud,heavy,quiet]);
 const result=await engine.search({query:'calm logo',kinds:['logo']});
 const calm=result.results.filter(r=>(r.evidence.style?.matched??[]).includes('calm')).map(r=>r.id);
 assert.ok(!calm.includes(loud.id)&&!calm.includes(heavy.id));
});

test('a relative clause describes the artifact named before it',async()=>{
 const query='button that morphs from label to loading spinner to success check mark';
 assert.deepEqual(queryIntent({query},query,new Set()).subjects,['button']);
 const plain='loading spinner';
 assert.deepEqual(queryIntent({query:plain},plain,new Set()).subjects,['progress']);
});

test('a nationality adjective is evidence for its country',async()=>{
 const stamp={...work(1),title:'Stamp designs',description:'A Japan airport stamp with bilingual labels.'};
 const result=await flat([stamp,work(2)]).search({query:'Japanese stamp',kinds:['design']});
 assert.equal(result.results[0].id,stamp.id);
 assert.ok(!(result.results[0].evidence.brief_terms?.missing??[]).includes('japan'));
});

test('a transformation verb after the artifact describes it, density and interaction words are read as asked',()=>{
 const intent=query=>queryIntent({query},query,new Set(['interaction']));
 assert.deepEqual(intent('submit button morphing into loading spinner then success check mark').subjects,['button']);
 assert.equal(intent('minimal information-dense AI agent dashboard').lowDensity,false);
 assert.equal(intent('minimal dashboard').lowDensity,true);
 assert.deepEqual(intent('send button micro interaction').context,[]);
});
