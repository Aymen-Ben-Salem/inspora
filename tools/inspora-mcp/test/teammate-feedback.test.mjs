import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {tokens,queryIntent} from '../relevance.mjs';
import {work,embed,vector,evidencedIds} from './fixtures.mjs';
function engine(works,options={}) {const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'teammate-feedback',capturedAt,rows},{embed,...options});}

test('compound AI agent brief offers evidenced related work without relaxing explicit filters',async()=>{
 const agent={...work(1),title:'Agent approval',description:'An AI agent dashboard shows an approval workflow.',industries:['AI agents'],colors:['Blue']};
 const unrelated={...work(2),title:'Shark chat',description:'A shark illustration sits above an inbox and chat.',colors:['Blue']};
 const e=engine([agent,unrelated]);
 const query='AI agent interface: agent tree, trace waterfall, agent inbox, chat with tools';
 const result=await e.search({query,filters:{colors:['Blue']}});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[agent.id,'related'],[unrelated.id,'subject']],'a wording topic orders works showing it first instead of removing others');
 assert.deepEqual(result.results[1].evidence.topic,{unverified:['ai agent']});
 assert.match(result.results[0].reason,/AI agent/i);
 assert.equal((await e.search({query,filters:{colors:['Red']}})).results.length,0);
 assert.equal((await e.search({query,subjects:['trace waterfall']})).results.length,0);
});

test('software context finds relevant website and design evidence without generic filler',async()=>{
 const site={...work(1,'website'),title:'Code collaboration',description:'A software product website presents API tooling and code review.'};
 const design={...work(2),title:'Review workspace',description:'A code review dashboard shows diffs and pull request status.'};
 const filler={...work(3,'website'),title:'Flower shop',description:'A website with a light floral layout.'};
 const tag={...work(4,'website'),title:'Dev toolkit',description:'A developer tool for managing projects.',industries:['Developer Tools']};
 const e=engine([site,design,filler,tag]);
 assert.ok((await e.search({query:'SaaS landing page',kinds:['website']})).results.some(r=>r.id===site.id));
 for(const [kind,id] of [['website',site.id],['design',design.id]]){
  const result=await e.search({query:'developer tool',kinds:[kind]});
  assert.ok(result.results.some(r=>r.id===id));
  assert.ok(result.results.every(r=>r.id!==filler.id));
 }
});

test('an icon within a design does not conflict with the explicit work kind',async()=>{
 const design={...work(1),title:'Navigation panel',description:'A navigation panel with a calendar icon.'};
 const icon={...work(2,'icon'),title:'Globe app icon',description:'A globe app icon.'};
 const e=engine([design,icon]);
 assert.deepEqual((await e.search({query:'icon'})).results.map(r=>r.id),[icon.id]);
 assert.deepEqual((await e.search({query:'icon',kinds:['design']})).results.map(r=>r.id),[design.id]);
});

// Revision 10: style traits come from the catalog's styles taxonomy and rank rather than filter.
test('taxonomy style cues rank works with every requested trait first and keep sans-serif distinct from serif',async()=>{
 const both={...work(1,'website'),title:'Editorial site',description:'Warm amber surfaces frame serif headings.',styles:['Serif']};
 const sans={...work(2,'website'),title:'Amber site',description:'Warm colours with sans-serif headings.',styles:['Sans-Serif']};
 const cold={...work(3,'website'),title:'Cool site',description:'Cold grey panels with serif headings.'};
 const other={...work(4,'website'),title:'Grey site',description:'Grey panels with sans-serif labels.',styles:['Serif','Sans-Serif']};
 const e=engine([both,sans,cold,other]);
 const serif=await e.search({query:'warm, serif'});
 assert.equal(serif.results[0].id,both.id);
 assert.deepEqual(serif.results[0].evidence.style,{matched:['Serif']});
 assert.match(serif.results.find(r=>r.id===sans.id).reason,/Style Serif unverified/,'sans-serif is not serif evidence');
 assert.deepEqual(serif.interpreted_query.derived_constraints.style,['Serif']);
 const sansSerif=await e.search({query:'warm sans-serif'});
 assert.equal(sansSerif.results[0].id,sans.id);
 assert.deepEqual(sansSerif.interpreted_query.derived_constraints.style,['Sans-Serif']);
});

test('a date picker needs selection evidence and calendar remains a broader search',async()=>{
 const picker={...work(1),title:'Date picker',description:'A date picker opens a calendar grid.'};
 const grid={...work(2),title:'Contribution calendar',description:'A calendar plots contributions over the past year.'};
 const e=engine([picker,grid]);
 assert.deepEqual((await e.search({query:'date picker'})).results.map(r=>r.id),[picker.id]);
 assert.equal((await e.search({query:'calendar'})).results.length,2);
});

test('explicit identity kinds and soft project context keep eligible adaptations in the pool',async()=>{
 const e=engine([work(1,'logo'),work(2,'icon')]);
 const mixed=await e.search({query:'Soft organic minimal logo with circle, wave, lotus, leaf or breath-like shapes, muted calm colors',kinds:['logo','icon']});
 assert.deepEqual(mixed.search_coverage.matching_by_kind,{logo:1,icon:1});
 // Revision 11: a domain the catalog lacks ranks adaptations sharing another brief term
 // first, pads with at most one page of other works, and reports the shortage.
 const calm={...work(3,'logo'),title:'Still',description:'A calm rounded logo with soft curves.'};
 const others=Array.from({length:12},(_,i)=>work(10+i,'logo'));
 const logo=await engine([...others,calm]).search({query:'Logo for a meditation app, calm and mindful',kinds:['logo'],context:'meditation, mindfulness, wellness'});
 assert.deepEqual(logo.results[0].id,calm.id);
 assert.ok(logo.results.every(r=>!r.evidence.context.matched),'no work evidences the explicit context');
 assert.equal(logo.search_coverage.brief_matches,0);
 assert.equal(logo.search_coverage.matching_works,10,'the whole kind is not returned as padding');
 assert.equal(logo.search_coverage.context_matches,0);
 assert.match(logo.notice,/No works show the whole brief: 1 shows most brief terms \(calm\), 0 show the context \(meditation mindfulness wellness\)\./);
});

test('a filtered website collection ranks style preferences and explains unavailable technology values',async()=>{
 const dev={...work(1,'website'),title:'SDK toolkit',categories:['Development'],description:'A project for making music.'};
 const e=engine([dev,work(2,'website')]);
 const result=await e.search({query:'Software product website with warm palette and precise interface details',kinds:['website'],filters:{categories:['Development']}});
 assert.deepEqual(result.results.map(r=>r.id),[dev.id]);
 assert.equal(result.interpreted_query.subject_scope,'primary');
 const empty=await e.search({query:'Send button animation',subjects:['send button'],filters:{technologies:['Framer Motion']}});
 assert.deepEqual(empty.interpreted_query.unavailable_filter_values,{technologies:['Framer Motion']});
});

test('agent industry alone cannot substantiate a contained agent interface',async()=>{
 const e=engine([{...work(1),title:'Brand work',industries:['AI Agent'],description:'A brand identity for a studio.'}]);
 assert.equal((await e.search({query:'agent interface',subjects:['agent interface'],subject_scope:'contains'})).results.length,0);
});

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
 for(const args of [{exclude_terms:['button']},{exclude_terms:['buttons']}]){const r=await e.search({query:'glass',...args});assert.deepEqual(r.results.map(x=>x.id),[rows[1].id]);}
 const text=await e.search({query:'glass without button'});assert.deepEqual(text.results.map(x=>[x.id,x.evidence.mentions_excluded]),[[rows[1].id,undefined],[rows[0].id,['button']]],'a text negation ranks last and is reported');
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
 assert.deepEqual(evidencedIds(result),[target.id,unrelated.id],'the chat horse is not a dashboard; the topic orders the dashboards');
 assert.deepEqual(result.results[1].evidence.topic,{unverified:['ai agent']});
});

test('long conversational briefs retain a specific topic across style and motion wording',async()=>{
 const targets=[{...work(1),title:'Agent dashboard',description:'A clean modern dashboard shows AI agent tasks.',industries:['AI agents']},{...work(2),title:'Agent status',description:'A clean status indicator shows an AI agent thinking.',industries:['AI agents']}];
 const noise=[{...work(3),title:'AI keychain',description:'A clean modern keychain has a clear charm.',industries:['AI']},{...work(4),title:'A shark',description:'A modern blue shark illustration uses clear outlines.'}];
 const e=engine([...targets,...noise]);
 for(const query of ['AI agent interface','I need inspiration for an AI agent interface that feels clean modern and professional with clear hierarchy and subtle motion']){
  const result=await e.search({query});assert.deepEqual(new Set(result.results.slice(0,2).map(r=>r.id)),new Set(targets.map(r=>r.id)),query);
  assert.ok(result.results.slice(2).every(r=>r.evidence.topic?.unverified),query);
 }
});

test('payment interfaces exclude decorative payment cards and pricing plans',async()=>{
 const checkout={...work(1),title:'Checkout form',description:'A checkout form collects delivery and payment details.'};
 const payment={...work(2),title:'Payment links',description:'A payment-link modal shows a copyable URL and sharing controls.'};
 const card={...work(3),title:'Shader credit card',description:'A payment card has a decorative flowing shader.'};
 const plan={...work(4),title:'Payment plans',description:'A payment-plan component lists a monthly price and features.'};
 const e=engine([checkout,payment,card,plan]);
 const exact=await e.search({query:'checkout'});assert.deepEqual(evidencedIds(exact),[checkout.id]);
 const payments=await e.search({query:'payment'});assert.ok(evidencedIds(payments).includes(payment.id));assert.ok(evidencedIds(payments).every(id=>![card.id,plan.id].includes(id)));
 const either=await e.search({query:'checkout or payment UI'});assert.deepEqual(new Set(evidencedIds(either)),new Set([checkout.id,payment.id]));
});

test('negative lists retain every excluded subject and remove them from positive interpretation',async()=>{
 const target={...work(1),title:'Clean dashboard',description:'A clean dashboard organizes metrics.'};
 const horse={...work(2),title:'Horse dashboard',description:'A clean dashboard has a pixel horse mascot.'};
 const shark={...work(3),title:'Shark dashboard',description:'A clean dashboard has a shark illustration.'};
 const e=engine([target,horse,shark]);
 const result=await e.search({query:'clean dashboards without sharks or horses'});assert.equal(result.results[0].id,target.id);
 assert.deepEqual(result.results.slice(1).map(r=>r.evidence.mentions_excluded).sort(),[['horses'],['sharks']],'works mentioning an excluded subject rank last and say so');
 assert.deepEqual(result.interpreted_query.derived_constraints.excluded,['sharks','horses']);
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
 const ordinary=await e.search({query:'conversational interface',subjects:['icon'],kinds:['icon']});assert.ok(!ordinary.interpreted_query.corrections?.some(c=>c.from==='conversational'));
});

test('uninterpretable untranslated input requests a rewrite rather than declaring catalog exhaustion',async()=>{
 const button={...work(1),title:'Blue glass button',description:'A blue glass button opens a menu.'};
 let embeddingCalls=0;const e=engine([button],{embed:async t=>{embeddingCalls++;return embed(t);}});
 for(const query of ['boutons en verre bleu','\u0623\u0632\u0631\u0627\u0631 \u0632\u062c\u0627\u062c\u064a\u0629 \u0632\u0631\u0642\u0627\u0621'])await assert.rejects(e.search({query}),/QUERY_REWRITE_REQUIRED/);
 assert.equal(embeddingCalls,0);
 assert.deepEqual((await e.search({query:'blue glass buttons'})).results.map(r=>r.id),[button.id]);
 assert.equal((await e.search({query:'purple submarine websites'})).results.length,0,'a genuine English shortage stays an empty result');
});

// Regressions from the 18 Nov 2026 revision-8 user test (search revision 9).
const similar=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
function scored(works,model){const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:similar(works[i][1])}));return new SearchEngine({snapshotId:'revision-9',capturedAt,model,rows},{embed});}

test('explicit subjects turn a wording-inferred topic into a preference and modifiers may come from taxonomy',async()=>{
 const coding={...work(1),title:'Coding agent',description:'A coding-agent card presents a five-step checklist with connected tools.',industries:['AI','SaaS']};
 const assistant={...work(2),title:'Assistant status',description:'An AI assistant agent card shows thinking states.',industries:['AI assistants']};
 const keychain={...work(3),title:'Keychain',description:'A clean keychain with a charm.',industries:['AI']};
 const e=engine([coding,assistant,keychain]);
 const result=await e.search({query:'AI assistant or agent interface showing reasoning steps and tool use',subjects:['AI agent'],subject_scope:'contains'});
 assert.deepEqual(result.results.map(r=>r.id),[assistant.id,coding.id],'the topic ranks first but no longer excludes the coding agent');
 assert.deepEqual(result.interpreted_query.topic_preferences,['ai assistant']);
 assert.equal(result.interpreted_query.topic_constraints,undefined);
 const alternative=await e.search({query:'AI assistant or agent interface'});
 assert.ok(alternative.results.some(r=>r.id===coding.id),'"X or Y" offers alternatives rather than one mandatory topic');
});

test('studio and portfolio sites are not developer-tool evidence on the Development category alone',async()=>{
 const library={...work(1,'website'),title:'Motion library',tagline:'JavaScript animation library.',description:'Technical diagrams and code panels.',categories:['Development','Software']};
 const studio={...work(2,'website'),title:'North',tagline:'Creative design and development studio.',description:'Oversized service labels and project previews.',categories:['Design','Development']};
 const portfolio={...work(3,'website'),title:'Jones',tagline:'Interactive creative development.',description:'A rotating cube of project imagery.',categories:['Portfolio','Development']};
 const result=await engine([library,studio,portfolio]).search({query:'developer tool website',kinds:['website']});
 assert.deepEqual(result.results.map(r=>r.id),[library.id]);
});

test('a page type needs topical evidence when the brief names a topic',async()=>{
 const notes={...work(1),title:'Notes landing page',description:'A landing page for a meeting transcription app.'};
 const alarm={...work(2),title:'Alarm landing page',description:'A landing page for an alarm clock app with a signup form.'};
 const e=engine([notes,alarm]);
 assert.deepEqual((await e.search({query:'landing page for a meeting transcription app',subjects:['landing page']})).results.map(r=>r.id),[notes.id]);
 assert.equal((await e.search({query:'simple landing page',subjects:['landing page']})).results.length,2,'style words are not a topic');
});

test('semantic gates follow the index embedding model',async()=>{
 const strong=[{...work(1),title:'Glass panel',description:'A frosted glass panel with soft blue light.'},.70];
 const weak=[{...work(2),title:'Glass bottle',description:'A glass bottle on a shelf.'},.60];
 const bge=scored([strong,weak],{name:'@cf/baai/bge-small-en-v1.5'});
 assert.deepEqual((await bge.search({query:'frosted glass'})).results.map(r=>r.id),[strong[0].id],'BGE scores near 0.6 for unrelated work');
 const mini=scored([strong,weak],{name:'Xenova/all-MiniLM-L6-v2'});
 assert.equal((await mini.search({query:'frosted glass'})).results.length,2);
 const filters=await bge.search({query:'frosted glass',filters:{colors:['Blue']}});
 assert.deepEqual(filters.interpreted_query.filters,{colors:['Blue']});
});
