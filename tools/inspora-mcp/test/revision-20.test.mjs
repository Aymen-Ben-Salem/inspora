// Search revision 20 (synthetic fixtures): a taxonomy label equal to a compound's stem is its
// domain, a shared word of an incomplete compound context is reported as a word only, a work
// showing another sense of a sense concept's head is no meaning evidence for it, motion words
// are never inferred industry contexts, skeleton loaders and steppers are concepts, and a
// springy motion is met by elastic or jelly-like prose on motion works.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {queryIntent,subjectFallbacks,senseHead,canonicalSubject} from '../relevance.mjs';
import {work,embed,vector} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r20',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
// Hosted model gates (query .62, concrete .55): similarity is set per work.
const bge=works=>new SearchEngine({snapshotId:'r20-bge',capturedAt,model:{name:'@cf/baai/bge-small-en-v1.5'},rows:normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}))},{embed});
const filler=(from,n,similarity,kind='design')=>Array.from({length:n},(_,i)=>[{...work(from+i,kind),title:'Filler '+i,description:'An unrelated composition.'},similarity]);
const video=row=>({...row,media:[{type:'video',url:'https://media.inspora.design/sample.mp4',poster:'https://media.inspora.design/sample.webp'}]});

test('revision 20 is current',()=>assert.equal(SEARCH_REVISION,20));

test('a taxonomy label equal to a compound stem is its domain (climate tech)',async()=>{
 const climate={...work(1,'website'),title:'Tide',description:'A waste-management website with industrial photographs.',categories:['Climate']};
 const other={...work(2,'website'),title:'Agency',description:'A studio website with bold type.',categories:['Technology']};
 for(const context of ['climate tech','climatetech']){
  const result=await flat([climate,other]).search({query:'startup website',kinds:['website'],context});
  const tide=result.results.find(r=>r.id===climate.id);
  assert.deepEqual(tide.evidence.context.matched,['climatetech'],context);
  assert.equal(result.search_coverage.context_matches,1,context);
  assert.equal(result.results[0].id,climate.id,context);
 }
});

test('one shared word of an incomplete compound context is reported as a word only',async()=>{
 const files={...work(1),title:'A file-management dashboard',description:'A dark file-management dashboard with a folder table.',industries:['Software']};
 const landlord={...work(2),title:'Rent dashboard',description:'A property dashboard lists units, tenants and rent.',industries:['Real Estate']};
 const result=await flat([files,landlord]).search({query:'dashboard',kinds:['design'],context:'property management'});
 const byId=Object.fromEntries(result.results.map(r=>[r.id,r]));
 assert.equal(byId[files.id].evidence.context.matched,undefined,'"management" alone is another sense of property management');
 assert.deepEqual(byId[files.id].evidence.context.word_only,['management']);
 assert.ok(!byId[files.id].evidence.context.unverified?.includes('management'),'a shown word is never reported as unverified');
 assert.match(byId[files.id].reason,/management as a word only/);
 // A work carrying the shared word as a whole label of its own keeps it (Fashion of fashion streetwear).
 const shop={...work(3,'logo'),title:'Skate',description:'A skateboard emblem.',industry:'Fashion'};
 const fashion=await flat([shop]).search({query:'logo',kinds:['logo'],context:'fashion streetwear'});
 assert.ok(fashion.results[0].evidence.context.matched?.includes('fashion'));
});

test('a work showing another sense of a sense concept is no meaning evidence for it',async()=>{
 assert.equal(senseHead('food menu'),'menu');
 const nav={...work(1),title:'Mega menu',description:'A navigation dropdown menu opens over a website header.'};
 const dish={...work(2),title:'Order card',description:'A delivery card shows an order moving through preparation.',industries:['Food & Beverage']};
 const result=await bge([[nav,.97],[dish,.97],...filler(10,200,.2)]).search({query:'food delivery app menu and ordering',kinds:['design'],context:'food delivery'});
 assert.deepEqual(result.interpreted_query.subjects,['food menu']);
 const menu=result.results.find(r=>r.id===nav.id);
 assert.notEqual(menu?.match,'similar','a navigation menu is not similar by meaning to a food menu');
 assert.notEqual(menu?.match,'subject');
 assert.equal(result.search_coverage.subject_matches,0);
});

test('motion words are never inferred industry contexts',()=>{
 const vocabulary=new Set(['animation','fashion','motion']);
 assert.deepEqual(queryIntent({query:'menu opening animation'},'menu opening animation',vocabulary).context,[]);
 assert.deepEqual(queryIntent({query:'fashion motion poster'},'fashion motion poster',vocabulary).context,['fashion']);
});

test('skeleton loaders and steppers are concepts with progress as their broader reading',async()=>{
 assert.equal(canonicalSubject('skeleton screen'),'skeleton loader');
 assert.deepEqual(subjectFallbacks('skeleton loader'),['progress'],'never the bare word skeleton');
 assert.equal(canonicalSubject('deploy pipeline'),'stepper');
 assert.equal(canonicalSubject('step indicator'),'stepper');
 assert.deepEqual(subjectFallbacks('stepper'),['progress']);
 const pipeline={...work(1),title:'Deploy Pipeline',description:'A deployment card tracks build, test and production stages across connected icons.'};
 const sales={...work(2),title:'Sales board',description:'A sales pipeline board groups deals by owner.'};
 const skeleton={...work(3),title:'Neon skeleton',description:'A skeleton pushes a boulder up a hillside.'};
 const loader={...work(4),title:'Loader',description:'A loading spinner turns above a progress bar.'};
 const steps=await flat([pipeline,sales,loader]).search({query:'multi-step progress stepper',kinds:['design'],subjects:['stepper']});
 assert.equal(steps.results.find(r=>r.id===pipeline.id)?.match,'subject');
 assert.notEqual(steps.results.find(r=>r.id===sales.id)?.match,'subject','a sales pipeline is no stepper');
 const skel=await flat([skeleton,loader]).search({query:'skeleton loading placeholder',kinds:['design'],subjects:['skeleton loader']});
 assert.equal(skel.results.find(r=>r.id===skeleton.id),undefined,'an anatomical skeleton is no skeleton loader');
 assert.equal(skel.results.find(r=>r.id===loader.id)?.match,'broader');
});

test('a springy motion is met by elastic or jelly-like prose on motion works',async()=>{
 const jelly=video({...work(1),title:'Jelly Slider',description:'A jelly-like slider stretches a translucent bar toward a glowing label.',category:'Motion'});
 const still={...work(2),title:'Jelly poster',description:'A jelly-like dessert sits on a plate.',category:'Print'};
 const result=await bge([[jelly,.58],[still,.58],...filler(10,200,.2)]).search({query:'spring physics bounce animation',kinds:['design']});
 const slider=result.results.find(r=>r.id===jelly.id);
 assert.ok(slider,'a motion work showing the quality through its equivalents is admitted at the concrete bar');
 assert.deepEqual(slider.evidence.style?.matched,['bouncy']);
 assert.ok(slider.evidence.brief_terms.matched.includes('bounce'));
 const poster=result.results.find(r=>r.id===still.id);
 assert.ok(!(poster?.evidence.style?.matched??[]).includes('bouncy')&&poster?.match!=='brief','an image work never shows a motion quality');
 // Outside a motion request, spring is no motion quality.
 const season=await flat([jelly]).search({query:'spring collection poster',kinds:['design']});
 assert.ok(!season.interpreted_query.derived_constraints?.appearance?.includes('bouncy'));
});

test('a form word (studio) never stands for a compound context, and the notice says so',async()=>{
 // Studio heads two labels (Design studio, Branding studio), so it is a form word, not a domain.
 const design={...work(1,'logo'),title:'Lens',description:'A monogram for a design studio.',industries:['Design studio']};
 const brand={...work(2,'logo'),title:'Beak',description:'A bird mark for a branding studio.',industries:['Branding studio','Studio']};
 const anim={...work(3,'logo'),title:'Reel',description:'A film-reel mark for an animation studio.',industries:['Animation']};
 const result=await flat([design,brand,anim]).search({query:'logo for an animation studio',kinds:['logo'],context:'animation studio'});
 assert.ok(!result.interpreted_query.derived_constraints?.motion,'animation describing the client is no motion request');
 const byId=Object.fromEntries(result.results.map(r=>[r.id,r]));
 assert.deepEqual(byId[brand.id].evidence.context.word_only,['studio'],'a Studio label does not make a branding studio an animation studio');
 assert.equal(byId[design.id].evidence.context.matched,undefined);
 assert.deepEqual(byId[anim.id].evidence.context.matched,['animation','studio']);
 assert.equal(result.search_coverage.context_matches,1);
 assert.equal(result.search_coverage.context_word_only,2);
 assert.match(result.notice,/2 share only the word studio with the context \(animation studio\)/);
});

test('notices show the context as written, voice interfaces are voice assistants, and a work naming every brief word is concrete evidence',async()=>{
 const climate={...work(1,'website'),title:'Tide',description:'A waste website.',categories:['Climate']};
 const tech=await flat([climate]).search({query:'startup website',kinds:['website'],context:'climate tech'});
 assert.doesNotMatch(tech.notice,/climatetech/);
 assert.equal(canonicalSubject('voice interface'),'voice assistant');
 const orb={...work(2),title:'Orbloom',description:'A glossy voice-interface orb with compact controls.'};
 const note={...work(3),title:'Voice note',description:'A shopping list with a voice-message player.'};
 const voice=await flat([orb,note]).search({query:'voice assistant interface',kinds:['design'],subjects:['voice assistant']});
 assert.equal(voice.results.find(r=>r.id===orb.id)?.match,'subject');
 assert.notEqual(voice.results.find(r=>r.id===note.id)?.match,'subject','a voice message is no voice assistant');
 const booking={...work(4),title:'A calendar booking page',description:'Date and time controls change the selected appointment.'};
 const result=await bge([[booking,.57],...filler(10,200,.2)]).search({query:'patient appointment booking app',kinds:['design'],context:'healthcare'});
 const page=result.results.find(r=>r.id===booking.id);
 assert.equal(page?.match,'brief','every brief word named admits at the concrete bar');
 assert.equal(result.search_coverage.term_matches,1);
});
