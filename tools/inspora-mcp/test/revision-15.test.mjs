// Search revision 15: the tool reports factual evidence per result and evidence counts per
// search; the assistant decides direct versus adaptation. Taxonomy values are matched after
// normalization (synthetic fixtures).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work,embed,vector} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r15',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
const spread=works=>new SearchEngine({snapshotId:'r15-spread',capturedAt,model:{name:'Xenova/all-MiniLM-L6-v2'},rows:normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}))},{embed});
const facts=result=>result.results.map(({evidence:{description,visual_notes,...rest}})=>rest);

test('results carry compact factual evidence and never a direct verdict',async()=>{
 assert.ok(SEARCH_REVISION>=16);
 const title={...work(1),title:'Toggle switch',description:'A toggle switch flips dark mode.',industries:['Fintech'],styles:['Dark']};
 const notes={...work(2),title:'Settings card',description:'A card lists account options.',industries:['Fintech'],searchOnly:'A small toggle sits at the right edge.'};
 const tag={...work(3),title:'Panel',description:'A dark panel.',categories:['Toggle'],styles:['Dark']};
 const result=await flat([notes,tag,title]).search({query:'dark toggle switch',subjects:['toggle switch'],context:'fintech'});
 assert.equal(result.results[0].id,title.id,'title and description evidence ranks first');
 for(const evidence of facts(result)){
  assert.ok(JSON.stringify(evidence).length<=260,JSON.stringify(evidence));
  assert.doesNotMatch(JSON.stringify(evidence),/direct|partial/);
 }
 assert.deepEqual(facts(result)[0],{subject:{matched_as:'literal',where:['title','description']},context:{matched:['fintech']},style:{matched:['Dark']},media:'image'});
 assert.ok(result.results.every(r=>['subject','contains','broader','similar','related','brief','browse'].includes(r.match)));
 assert.match(result.results[0].reason,/^Subject toggle \(literal in title, description\)\. Context fintech matched\. Style Dark matched\.$/);
 assert.equal(result.search_coverage.direct_matches,undefined);
 assert.equal(typeof result.search_coverage.subject_matches,'number');
 assert.equal(result.results[0].evidence.description,title.description,'catalog text stays available for the reader');
});

test('subject evidence distinguishes literal, alias, derived, contained, broader and semantic readings',async()=>{
 const alias={...work(1),title:'Visa card',description:'A platinum Visa card with a metal finish.'};
 const literal={...work(2),title:'Credit card',description:'A credit card flips to its back.'};
 const e=flat([alias,literal]);
 const cards=await e.search({query:'credit card',subjects:['credit card']});
 assert.deepEqual(cards.results.map(r=>[r.id,r.evidence.subject.matched_as]),[[literal.id,'literal'],[alias.id,'alias']]);
 const tracking={...work(3),title:'sleep-tracking dashboard',description:'A sleep-tracking dashboard with stages.'};
 assert.equal((await flat([tracking]).search({query:'sleep tracker',subjects:['sleep tracker']})).results[0].evidence.subject.matched_as,'derived');
 const within={...work(4),title:'Sales overview',description:'A dashboard shows a weekly chart beside totals.'};
 const contained=await flat([within]).search({query:'chart'});
 assert.deepEqual(contained.results[0].evidence.subject,{matched_as:'contained',where:['description']});
 const media=[{...work(5),title:'Deck',description:'A media player shows playback controls.'},.9];
 const filler=Array.from({length:120},(_,i)=>[{...work(200+i),title:'Filler '+i,description:'A small study of shapes number '+i+'.'},.05+.002*i]);
 const broader=await spread([media,...filler]).search({query:'music player',subjects:['music player'],kinds:['design']});
 assert.deepEqual(broader.results[0].evidence.subject,{via:['player'],matched_as:'broader',where:['description']});
 assert.equal(broader.results[0].evidence.meaning_top_pct,1);
});

test('shortage flags and notices count evidence over the whole search, not the page',async()=>{
 const cards=Array.from({length:12},(_,i)=>({...work(i+1),title:'Profile card '+i,description:'A profile card with account details.'}));
 const e=flat(cards);
 const first=await e.search({query:'profile card',subjects:['profile card'],count:10});
 assert.equal(first.insufficient_matches,false);
 const last=await e.search({cursor:first.next_cursor,count:10});
 assert.equal(last.results.length,2);
 assert.equal(last.insufficient_matches,false,'12 evidenced works exceed the requested 10');
 const few=await e.search({query:'profile card',subjects:['profile card'],count:20});
 assert.equal(few.insufficient_matches,true);
 assert.match(few.notice,/12 works show the subject \(profile card\)\./);
 const context=await e.search({query:'profile card',subjects:['profile card'],context:'aviation'});
 assert.equal(context.insufficient_matches,false);
 assert.match(context.notice,/No matching works show evidence of the requested context \(aviation\)\./,'a context barely covered is reported even without a shortage');
 const filtered=await e.search({query:'profile card',subjects:['profile card'],filters:{styles:['Brutalist']}});
 assert.match(filtered.notice,/No catalog work has styles Brutalist\./,'an empty filter is named instead of the subject');
});

test('website themes are style evidence and a styles filter; a near-universal style carries no weight',async()=>{
 const sites=Array.from({length:24},(_,i)=>({...work(i+1,'website'),title:'Site '+i,description:'A studio website.',themes:i<3?['Animated','Minimal']:['Animated']}));
 const e=flat(sites);
 const minimal=await e.search({query:'minimal animated website',kinds:['website']});
 assert.deepEqual(minimal.interpreted_query.derived_constraints.style,['Minimal']);
 assert.deepEqual(minimal.interpreted_query.derived_constraints.common_styles,['Animated']);
 assert.deepEqual(new Set(minimal.results.slice(0,3).map(r=>r.id)),new Set(sites.slice(0,3).map(r=>r.id)));
 assert.deepEqual(minimal.results[0].evidence.style,{matched:['Minimal']});
 assert.equal(minimal.search_coverage.style_matches,3);
 const filtered=await e.search({query:'website',kinds:['website'],filters:{styles:['minimal']}});
 assert.deepEqual(new Set(filtered.results.map(r=>r.id)),new Set(sites.slice(0,3).map(r=>r.id)));
});

test('taxonomy filters normalize comma-joined, spacing, hyphen, plural and & variants without synonyms',async()=>{
 const icon={...work(1,'icon'),title:'Planner',description:'A planner icon.',industry:'AI, Productivity'};
 const logo={...work(2,'logo'),title:'Run',description:'A runner mark.',industry:'Sport & Fitness',shape:'Symbol & Text, Geometric'};
 const shop={...work(3),title:'Shop',description:'A shop card.',industries:['Ecommerce']};
 const tech={...work(4,'logo'),title:'Chip',description:'A chip mark.',industry:'Tech, SaaS'};
 const e=flat([icon,logo,shop,tech]);
 const ids=async filters=>(await e.search({query:'mark icon card',kinds:['icon','logo','design'],filters})).results.map(r=>r.id).sort();
 assert.deepEqual(await ids({industry:['productivity']}),[icon.id]);
 assert.deepEqual(await ids({industries:['Sports & Fitness']}),[logo.id]);
 assert.deepEqual(await ids({industry:['Fitness']}),[logo.id],'a value joined with & matches its parts');
 assert.deepEqual(await ids({shape:['geometric']}),[logo.id]);
 assert.deepEqual(await ids({industry:['E-Commerce']}),[shop.id]);
 assert.deepEqual(await ids({industry:['Technology']}),[],'no synonyms: Tech is not Technology');
 const none=await e.search({query:'mark',filters:{industry:['Technology']}});
 assert.deepEqual(none.interpreted_query.unavailable_filter_values,{industry:['Technology']});
 assert.deepEqual(none.interpreted_query.filters,{industry:['Technology']},'filters are echoed as written');
});

test('explicit context evidence orders every tier: a context-matched work precedes one sharing only a brief word',async()=>{
 const notes=[1,2].map(n=>({...work(n),title:'Notes screen '+n,description:'A notes app editor with pinned notes.',industries:['Notes app']}));
 const icon={...work(3),title:'App icon concept',description:'An app icon concept for a brand identity.',industries:['Mobile apps']};
 const result=await flat([icon,...notes]).search({query:'notes app interface and identity',context:'notes app'});
 assert.deepEqual(result.results.map(r=>r.id).slice(0,2).sort(),notes.map(r=>r.id).sort());
 assert.equal(result.results[2].id,icon.id);
 assert.match(result.notice,/most of the brief overall; by part, \d+ shows? most brief terms \(identity\), 2 show the context/,'the shortage sentence restates the counts');
});

test('a context part that begins a word of the work\'s taxonomy label is related, not unverified',async()=>{
 const site={...work(1,'website'),title:'Firm',description:'A law firm website.',categories:['Technology']};
 const result=await flat([site]).search({query:'startup landing page',kinds:['website'],context:'legal tech'});
 assert.deepEqual(result.results[0].evidence.context,{related:['tech'],unverified:['legal']});
});

test('logos and icons are one mark: a subject named in their public prose is the subject; shape taxonomy names it too',async()=>{
 const combo={...work(1,'logo'),title:'Papier',description:'An open-book symbol sits above a serif wordmark.',styles:['Serif']};
 const shaped={...work(2,'logo'),title:'Norton',description:'Oversized serif lettering over a painting.',shape:'Wordmark',styles:['Serif']};
 const result=await flat([combo,shaped]).search({query:'serif wordmark logo',kinds:['logo']});
 assert.deepEqual(result.results.map(r=>r.match),['subject','subject']);
 assert.equal(result.search_coverage.subject_matches,2);
});

test('a prompt bar is input evidence for a prompt input',async()=>{
 const bar={...work(1),title:'AI prompt bar',description:'A pale AI prompt bar floats over a gradient.'};
 const result=await flat([bar]).search({query:'AI chat prompt input',kinds:['design'],subjects:['prompt input']});
 assert.equal(result.results[0].match,'subject');
});

test('motion requests rank video works before stills within a tier and say when motion is not shown',async()=>{
 const still={...work(1),title:'Glass button',description:'A glass button with a soft shadow.',media:[{type:'image',url:'https://media.inspora.design/a.webp'}]};
 const video={...work(2),title:'Press button',description:'A button squashes when pressed.',media:[{type:'video',url:'https://media.inspora.design/b.mp4'}]};
 const e=flat([still,video]);
 const motion=await e.search({query:'button micro-interaction',kinds:['design'],subjects:['button']});
 assert.equal(motion.interpreted_query.derived_constraints.motion,true);
 assert.deepEqual(motion.results.map(r=>[r.id,r.evidence.media]),[[video.id,'video'],[still.id,'image']]);
 assert.match(motion.results[1].reason,/Still image; motion not shown./);
 const plain=await e.search({query:'glass button',kinds:['design'],subjects:['button']});
 assert.equal(plain.interpreted_query.derived_constraints?.motion,undefined);
 assert.doesNotMatch(plain.results.find(r=>r.id===still.id).reason,/Still image/);
});

test('with no brief word in the catalog, a fully shown explicit context admits works',async()=>{
 const order={...work(1),title:'order-status card',description:'A delivery card moves through preparation and delivered states.',industries:['Food & Beverage']};
 const other={...work(2),title:'Profile card',description:'A profile card.'};
 const result=await flat([order,other]).search({query:'recipe cooking app interface',kinds:['design'],context:'food'});
 assert.equal(result.results[0].id,order.id);
 assert.deepEqual(result.results[0].evidence.context,{matched:['food']});
});

test('a phrase never starts or ends inside a hyphen-joined compound, in public text or notes',async()=>{
 const macos={...work(1),title:'MacOS',description:'A window-control concept with controller-like window buttons.',media:[{type:'image',url:'https://media.inspora.design/a.webp'}]};
 const ticket={...work(2),title:'Ticket card',description:'A card on a grey page.',searchOnly:'A ticket-like button sits below.',media:[{type:'video',url:'https://media.inspora.design/b.mp4'}]};
 const like={...work(3),title:'Like button',description:'A heart like button bursts when tapped.',media:[{type:'video',url:'https://media.inspora.design/c.mp4'}]};
 const sleep={...work(4),title:'Sleep board',description:'A sleep-tracking dashboard.'};
 const signature={...work(5),title:'Sign',description:'An e-signature field for contracts.'};
 const button={...work(6),title:'Event button',description:'An add-to-calendar button.'};
 const e=flat([macos,ticket,like,sleep,signature,button]);
 const result=await e.search({query:'like button tap animation',kinds:['design'],subjects:['like button']});
 assert.deepEqual(result.results.filter(r=>r.match==='subject').map(r=>r.id),[like.id],'controller-like and ticket-like supply no "like"');
 const tiers=result.results.map(r=>[r.match,r.evidence.media]);
 assert.ok(tiers.every(([match,media],i)=>media==='video'||!tiers.slice(i+1).some(([other,m])=>other===match&&m==='video')),'no still precedes a video of its tier');
 assert.equal((await e.search({query:'sleep tracker',subjects:['sleep tracker']})).results[0].evidence.subject.matched_as,'derived','a compound wholly inside the phrase still counts');
 assert.equal((await e.search({query:'signature field',subjects:['signature field']})).results[0].id,signature.id,'a short prefix (e-) does not bind');
 assert.ok(!(await e.search({query:'calendar',subjects:['calendar']})).results.some(r=>r.id===button.id&&r.match==='subject'),'add-to-calendar names a button, not a calendar');
});

test('revision 16: drag-and-drop vocabulary reaches drop zones and dragged objects; dragging alone is the broader drag gesture',async()=>{
 const card={...work(1),title:'File upload card',description:'A PDF chip is dragged toward a dark upload card with a dimensional drop target.'};
 const zone={...work(2),title:'HEIC File Upload',description:'Softly colored photo cards sit above a clear drop zone.'};
 const slider={...work(3),title:'Sliders',description:'Thin sliders on a dark panel. Dragging the controls pulls their handles.'};
 const dropdown={...work(4),title:'Dropdown',description:'A dropdown menu opens with a soft drop shadow.'};
 const e=flat([card,zone,slider,dropdown]);
 for(const subjects of [['drag and drop'],['drag-and-drop'],['draggable'],['drop zone']]){
  const result=await e.search({query:'drag and drop interaction',kinds:['design'],subjects});
  assert.deepEqual(result.results.filter(r=>r.match==='subject').map(r=>r.id).sort(),[card.id,zone.id].sort(),JSON.stringify(subjects));
  assert.ok(!result.results.some(r=>r.id===dropdown.id&&r.match==='subject'),'a dropdown or drop shadow is no drop zone');
 }
 const broader=await e.search({query:'drag and drop interaction',kinds:['design'],subjects:['drag and drop']});
 assert.deepEqual(broader.results.find(r=>r.id===slider.id)?.evidence.subject,{via:['drag'],matched_as:'broader',where:['description']});
 assert.deepEqual((await e.search({query:'drag and drop interaction',kinds:['design']})).interpreted_query.subjects,['drag and drop']);
});

test('revision 16: a criteria-free request is a varied browse of the requested kinds, never empty',async()=>{
 const icons=[...Array.from({length:4},(_,i)=>({...work(10+i,'icon'),title:'Travel '+i,description:'A travel icon.',industry:'Travel'})),
  ...Array.from({length:4},(_,i)=>({...work(20+i,'icon'),title:'Music '+i,description:'A music icon.',industry:'Music'}))];
 const e=flat(icons);
 const mix=await e.search({query:'a surprise mix of standout app icons',kinds:['icon']});
 assert.equal(mix.results.length,8);
 assert.ok(mix.results.every(r=>r.match==='browse'),'words outside the catalog vocabulary are no criteria');
 assert.match(mix.notice,/8 more are a varied browse/);
 for(const query of ['fresh mix of icons','surprise mix of diverse icon styles','varied icon inspiration','surprise me with a fresh mix of icons'])assert.equal((await e.search({query,kinds:['icon']})).results.length,8,query);
 assert.match((await e.search({query:'icons',kinds:['icon']})).notice,/No specific criteria were applied/);
 assert.notEqual(mix.results[0].title.split(' ')[0],mix.results[1].title.split(' ')[0],'the first page alternates categories');
 assert.equal(mix.insufficient_matches,true,'8 works for a page of 10');
 assert.ok((await e.search({query:'surprise mix'})).results.length,'no kinds: browse everything rather than an input error');
});

test('revision 16: page-format subjects, equivalent aliases, supported style labels and catalog product names',async()=>{
 const saas=[1,2].map(n=>({...work(n,'website'),title:'Tool '+n,description:'A software product website.',industries:['SaaS']}));
 const hero=await flat([...saas,{...work(3,'website'),title:'Shop',description:'A shop website.'}]).search({query:'SaaS landing page hero section with product screenshot',kinds:['website'],subjects:['hero section'],context:'SaaS'});
 assert.equal(hero.search_coverage.matching_works,3,'a hero section filters out no website');
 assert.equal(hero.search_coverage.brief_matches,2,'the explicit context carries the brief without the word screenshot');
 const navbar={...work(4),title:'Navbar',description:'A navbar slides between pages.'};
 const nav=await flat([navbar]).search({query:'navigation menu hover animation',kinds:['design'],subjects:['navigation menu']});
 assert.deepEqual([nav.interpreted_query.subjects,nav.results[0].match],[['navigation'],'subject']);
 const darks=[5,6,7].map(n=>({...work(n),title:'Board '+n,description:'A dashboard.',styles:['Dark']}));
 const modes=[8,9].map(n=>({...work(n),title:'Mode '+n,description:'A dashboard.',styles:['Dark mode']}));
 const dark=await flat([...darks,...modes]).search({query:'dark mode dashboard',kinds:['design'],subjects:['dashboard']});
 assert.deepEqual(dark.interpreted_query.derived_constraints.style,['Dark'],'the supported label wins');
 assert.equal(dark.search_coverage.style_matches,5,'a Dark mode tag also evidences Dark');
 const island={...work(10),title:'Dynamic Island alert',description:'A Dynamic Island notification expands.'};
 const di=await flat([island]).search({query:'Dynamic Island style notification animations',kinds:['design']});
 assert.equal(di.interpreted_query.derived_constraints?.reference_brands,undefined,'a product name the catalog uses is no reference brand');
});

test('revision 16: an AI thinking state is loading evidence, but a progress bar is no thinking state',async()=>{
 const think={...work(1),title:'Thinking states',description:'An AI assistant card shows thinking states.'};
 const bar={...work(2),title:'Progress bar',description:'A progress bar fills from left to right.'};
 const e=flat([think,bar]);
 const loading=await e.search({query:'loading animation',kinds:['design'],subjects:['loading animation']});
 assert.deepEqual(loading.results.filter(r=>r.match==='subject').map(r=>r.id).sort(),[think.id,bar.id].sort());
 const thinking=await e.search({query:'AI thinking state animation',kinds:['design'],subjects:['thinking state']});
 assert.deepEqual(thinking.results.filter(r=>r.match==='subject').map(r=>r.id),[think.id]);
});

test('revision 16: phrase units stand together and a facet naming a domain needs a domain part',async()=>{
 const stack={...work(1),title:'Card stack',description:'A stack of cards fans out when swiped.'};
 const verb={...work(2),title:'Send',description:'The screen stacks an amount card above recipient details.'};
 const far={...work(3),title:'Ticker',description:'An animation warps a dense page of text into a vortex.'};
 const e=flat([stack,verb,far]);
 const result=await e.search({query:'card stack',kinds:['design'],subjects:['card stack']});
 assert.deepEqual(result.results.filter(r=>r.match==='subject').map(r=>r.id),[stack.id],'"stacks an amount card" is no card stack');
 assert.equal((await e.search({query:'text animation',kinds:['design'],subjects:['text animation']})).results.find(r=>r.id===far.id)?.match,'subject','units a few words apart still belong together');
 const food={...work(3,'website'),title:'Oat drink',description:'A plant-based drink brand website.',industries:['Food & Drink']};
 const studio={...work(4,'website'),title:'Studio',description:'A brand design studio website.'};
 const site=await flat([food,studio]).search({query:'website for a plant-based food brand',kinds:['website'],context:'food and beverage consumer brand'});
 assert.equal(site.search_coverage.context_matches,1,'"brand" alone does not make a studio a food work');
});
