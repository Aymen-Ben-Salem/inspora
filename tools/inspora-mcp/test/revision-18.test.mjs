// Search revision 18 (synthetic fixtures): curated taxonomy evidence needs only the concrete
// gate, filters are the criteria of a criteria-free brief, appearance and mood words count
// through equivalents, word senses (character, menu, tab, language, a verb) are read from
// context, motion verbs evidence an animation on video works and make a motion request.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {queryIntent,prepareDocument,subjectEvidence} from '../relevance.mjs';
import {work,embed,vector} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r18',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
// Hosted model gates (query .62, concrete .55): similarity is set per work.
const bge=works=>new SearchEngine({snapshotId:'r18-bge',capturedAt,model:{name:'@cf/baai/bge-small-en-v1.5'},rows:normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}))},{embed});
const filler=(from,n,kind='design')=>Array.from({length:n},(_,i)=>[{...work(from+i,kind),title:'Filler '+i,description:'An unrelated composition.'},.40]);
const evidence=(document,subject,scope='primary')=>subjectEvidence(document,{subjects:[subject],subject_scope:scope}).length>0;

test('revision 18 or later is current',()=>assert.ok(SEARCH_REVISION>=18));

test('a requested style tagged on a work admits it at the concrete gate when styles are all the catalog verifies',async()=>{
 const retro={...work(1,'website'),title:'Arcade',description:'An editorial site with oversized headings.',themes:['Retro','Animated']};
 const plain={...work(2,'website'),title:'Plain',description:'An editorial site with oversized headings.',themes:['Minimal']};
 const other={...work(3,'website'),title:'Pixel',description:'A pixel-art landing page.',themes:['Retro']};
 const result=await bge([[retro,.58],[plain,.58],[other,.40],...filler(10,8,'website')]).search({query:'retro brutalist website',kinds:['website']});
 assert.equal(result.results[0].id,retro.id);
 assert.equal(result.results[0].match,'brief');
 assert.deepEqual(result.results[0].evidence.style,{matched:['Retro']});
 assert.equal(result.search_coverage.brief_matches,1);
});

test('a brief word met in the work\'s own taxonomy admits it at the concrete gate; the same word in prose alone needs the query gate',async()=>{
 const tagged={...work(1),title:'Cassette stack',description:'A dark interface arranges vintage tapes in a diagonal stack.',industries:['Music']};
 const prose={...work(2),title:'Waveform',description:'A music interface shows a waveform.'};
 const result=await bge([[tagged,.58],[prose,.58],...filler(10,8)]).search({query:'music app interface',kinds:['design']});
 const ids=result.results.filter(r=>r.match==='brief').map(r=>r.id);
 assert.ok(ids.includes(tagged.id),'taxonomy evidence admits at the concrete gate');
 assert.ok(!ids.includes(prose.id),'prose alone below the query gate is not evidence');
});

test('explicit filters are the criteria of a brief that names only the work kind',async()=>{
 const icons=Array.from({length:12},(_,i)=>({...work(i+1,'icon'),title:'Icon '+i,description:'A rounded symbol.',styles:['3D']}));
 const result=await flat(icons).search({query:'app icon',kinds:['icon'],filters:{styles:['3D']}});
 assert.equal(result.search_coverage.brief_matches,12);
 assert.equal(result.insufficient_matches,false);
 assert.equal(result.search_coverage.browse_fill,undefined);
});

test('appearance and mood words are found through their equivalents',async()=>{
 const soft={...work(1),title:'Wellness screens',description:'Soft pastel screens use desaturated tones and generous spacing.'};
 const loud={...work(2),title:'Loud screens',description:'Saturated screens with heavy contrast.'};
 const calm={...work(3),title:'Calm note',description:'A calm, muted note card.'};
 const result=await flat([soft,loud,calm]).search({query:'calm muted pastel app screens',kinds:['design']});
 const found=result.results.find(r=>r.id===soft.id);
 assert.deepEqual(found.evidence.brief_terms.matched.sort(),['calm','muted','pastel']);
 assert.equal(result.search_coverage.brief_matches,2);
});

test('the Typography heading of visual notes is no Typography style',async()=>{
 const noted={...work(1),title:'Card',description:'A compact card.',searchOnly:'A compact card. Typography: plain sans-serif labels.'};
 const tagged={...work(2),title:'Poster',description:'A type poster.',styles:['Typography']};
 const second={...work(3),title:'Specimen',description:'A type specimen.',styles:['Typography']};
 const result=await flat([noted,tagged,second]).search({query:'typography poster',kinds:['design']});
 assert.deepEqual(result.results.find(r=>r.id===noted.id)?.evidence.style??{unverified:['Typography']},{unverified:['Typography']});
 assert.deepEqual(result.results.find(r=>r.id===tagged.id).evidence.style,{matched:['Typography']});
});

test('a character is read in its depicted sense; abstract and letter senses are not characters',()=>{
 const doc=(description,extra={})=>prepareDocument(normalizeRows({capturedAt,rows:[{...work(1,'logo'),title:'Mark',description,...extra}]})[0]);
 assert.ok(evidence(doc('A small smiling character sits beside a lowercase wordmark.'),'character'));
 assert.ok(evidence(doc('A cheerful mascot waves beside the name.'),'character'),'a mascot is a character');
 assert.ok(!evidence(doc('Uneven strokes give the compact wordmark an informal, hand-painted character.'),'character'),'abstract sense');
 assert.ok(!evidence(doc('A dense page of tiny characters bends into a vortex.'),'character'),'letter sense');
 assert.ok(evidence(doc('A chimp in a cap beside heavy lettering.',{shape:'Symbol & Text, Animal'}),'character'),'an Animal shape depicts a character');
 const intent=queryIntent({query:'mascot logo',subjects:['mascot']},'mascot logo',new Set());
 assert.deepEqual(intent.subjects,['character']);
});

test('a food or restaurant cue selects the food sense of menu',async()=>{
 const intent=queryIntent({query:'restaurant menu and ordering app',context:'food and beverage'},'restaurant menu and ordering app',new Set());
 assert.deepEqual(intent.subjects,['food menu']);
 assert.deepEqual(queryIntent({query:'context menu'},'context menu',new Set()).subjects,['menu']);
 const nav={...work(1),title:'Mega Menu Animation',description:'A navigation menu expands into a large dropdown panel.'};
 const card={...work(2),title:'Cafe menu card',description:'A cafe menu lists dishes and prices beside a photo.'};
 const result=await flat([nav,card]).search({query:'restaurant menu design',kinds:['design']});
 assert.deepEqual(result.results.filter(r=>r.match==='subject').map(r=>r.id),[card.id]);
});

test('a literal word inside a phrase that names something else is no evidence for it',()=>{
 const doc=(description,extra={})=>prepareDocument(normalizeRows({capturedAt,rows:[{...work(1),title:'Study',description,...extra}]})[0]);
 assert.ok(!evidence(doc('A slider, notification and text input animate across a dark field.'),'text animation'),'text of text input');
 assert.ok(evidence(doc('Animated text letters slide into place.'),'text animation'));
 assert.ok(!evidence(doc('Shallow folder tabs recede inside an outlined drawer.'),'tab','contains'),'a folder tab is no interface tab');
 assert.ok(evidence(doc('Rounded tabs switch between three views.'),'tab','contains'));
 assert.ok(!evidence(doc('The visual language pairs bold type with photos.'),'language','contains'));
 assert.ok(!evidence(doc('The layout balances the headline against a wide photo.'),'balance','contains'),'a verb is not the noun');
 assert.ok(evidence(doc('A large account balance sits above recent transactions.'),'balance','contains'));
 assert.ok(evidence(doc('A payment form collects card details.'),'payment form'),'the requested phrase itself counts');
});

test('motion verbs evidence an animation on a video work and make a motion request',async()=>{
 const video={...work(1),title:'Reading view',description:'A reading interface subtly scales text as it scrolls out of view.',media:[{type:'video',url:'https://media.inspora.design/a.mp4',poster:'https://media.inspora.design/a.webp'}]};
 const still={...work(2),title:'Reading still',description:'A reading interface subtly scales text as it scrolls out of view.'};
 const vdoc=prepareDocument(normalizeRows({capturedAt,rows:[video]})[0]),sdoc=prepareDocument(normalizeRows({capturedAt,rows:[still]})[0]);
 assert.ok(evidence(vdoc,'text animation'),'motion verbs on a video work');
 assert.ok(!evidence(sdoc,'text animation'),'a still shows no motion');
 const result=await flat([still,video]).search({query:'text reveal on scroll',kinds:['design']});
 assert.equal(result.interpreted_query.derived_constraints.motion,true);
 assert.equal(result.results[0].id,video.id,'video works precede stills for a motion request');
});
