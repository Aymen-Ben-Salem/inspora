// Search revision 13, balanced recall (revision 15 evidence contract): multi-word contexts
// by facet, derivational subject evidence, broader readings ordered by how much of the
// subject they carry, style words used as styles, style evidence for style-led briefs and
// absence notices after derivation (synthetic fixtures).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {derivations} from '../relevance.mjs';
import {work,embed,vector,evidencedIds} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'recall',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const unit=v=>{const n=Math.hypot(...v)||1;return [...v.map(x=>x/n),...Array(384-v.length).fill(0)];};
// Keyed embeddings: each text maps to a direction; rows carry their own vectors.
const keyedEngine=(works,keyed,rowVector=()=>unit([0,0,0,0,0,0,1]))=>new SearchEngine({snapshotId:'keyed',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:rowVector(row)}))},{embed:async texts=>texts.map(text=>unit(keyed(text.toLowerCase())))});

test('derivational relatives share a base; agent nouns and -ing nouns keep their own sense',()=>{
 assert.ok(derivations('tracker').includes('tracking'));
 assert.ok(derivations('manager').includes('management'));
 assert.ok(derivations('verification').includes('verifying'));
 assert.ok(!derivations('printer').includes('print'),'a printer is not print');
 assert.ok(!derivations('booking').includes('book'),'a booking is no book');
 assert.ok(!derivations('building').includes('build'));
});

test('a multi-word context needs one evidenced part per facet: parts naming one domain are one facet',async()=>{
 // Labels share a small common direction, so the closest tenth of label pairs is low;
 // fashion and streetwear are close, furniture and e-commerce are not.
 const keyed=t=>t==='fashion'?[1,0,0,0,0,.2]:t==='streetwear'?[.95,.3,0,0,0,.2]:t==='furniture'?[0,1,0,0,0,0]:/commerce/.test(t)?[0,0,1,0,0,0]:t==='music'?[0,0,0,1,0,.2]:t==='sports'?[0,0,0,0,1,.2]:[0,0,0,0,0,0,1];
 const logos=[{...work(1,'logo'),title:'Skate',description:'A skateboard emblem.',industry:'Fashion'},{...work(2,'logo'),title:'Note',description:'A music note mark.',industry:'Music'},
  {...work(3,'logo'),title:'Ball',description:'A ball mark.',industry:'Sports'},{...work(4,'logo'),title:'Chair',description:'A chair mark.',industry:'Furniture, E-commerce'},{...work(5,'logo'),title:'Cart',description:'A cart mark.',industry:'E-commerce'}];
 const e=keyedEngine(logos,keyed);
 const fashion=await e.search({query:'logo for a streetwear brand',kinds:['logo'],context:'fashion streetwear'});
 assert.deepEqual(fashion.interpreted_query.context_facets,[['fashion','streetwear']]);
 const skate=fashion.results.find(r=>r.id===logos[0].id);
 assert.equal(fashion.results[0].id,skate.id);
 assert.deepEqual(skate.evidence.context,{matched:['fashion'],unverified:['streetwear']});
 assert.equal(fashion.search_coverage.context_matches,1,'one evidenced part per facet matches the context');
 assert.match(skate.reason,/Context fashion matched, streetwear unverified/);
 const furniture=await e.search({query:'logo for a furniture store',kinds:['logo'],context:'furniture e-commerce'});
 assert.deepEqual(furniture.interpreted_query.context_facets,[['furniture'],['e-commerce']]);
 const byId=Object.fromEntries(furniture.results.map(r=>[r.id,r]));
 assert.deepEqual(byId[logos[3].id].evidence.context,{matched:['furniture','e-commerce']});
 assert.deepEqual(byId[logos[4].id].evidence.context,{matched:['e-commerce'],unverified:['furniture']},'e-commerce alone is not the furniture domain');
 assert.equal(furniture.search_coverage.context_matches,1);
 assert.equal(furniture.results[0].id,logos[3].id);
});

test('a context word reaches its bare base only when the request uses that base',async()=>{
 const invoice={...work(1),title:'Invoice',description:'An invoice table with a download drawer.',industries:['Fintech']};
 const e=flat([invoice]);
 const both=await e.search({query:'invoice screen',subjects:['invoice'],context:'invoicing fintech'});
 assert.deepEqual(both.results[0].evidence.context,{matched:['invoicing','fintech']});
 assert.equal(both.results[0].match,'subject');
});

test('a multi-word subject is met by derivational relatives, never by a relative alone',async()=>{
 const sleep={...work(1),title:'sleep-tracking dashboard',description:'A sleep-tracking dashboard with a stage timeline.'};
 const files={...work(2),title:'a file-management dashboard',description:'A file-management dashboard with a folder table.'};
 const users={...work(3),title:'admin dashboard',description:'A user-management dashboard with profile cards.'};
 const e=flat([sleep,files,users]);
 assert.deepEqual(evidencedIds(await e.search({query:'sleep tracker app',subjects:['sleep tracker']})),[sleep.id]);
 const manager=await e.search({query:'file manager',subjects:['file manager']});
 assert.deepEqual(evidencedIds(manager),[files.id]);
 assert.ok(!manager.results.some(r=>r.id===users.id&&r.match==='subject'),'user management is not a file manager');
 assert.equal(manager.results[0].evidence.subject.matched_as,'derived');
});

test('a phrase missing a generic head is a broader reading led by its specific word; a concept head is never the subject',async()=>{
 const keyed=t=>/receipt animation/.test(t)?[1,0,0]:/flight card/.test(t)?[0,1,0]:[0,0,1];
 const receipt={...work(1),title:'Receipt Printer',description:'A payment panel feeds a paper receipt.'};
 const booking={...work(2),title:'flight booking',description:'A flight booking screen with seat options.'};
 const fillers=Array.from({length:24},(_,i)=>({...work(10+i),title:'Motion '+i,description:'An animation of shapes.'}));
 const vectors=new Map([[receipt.id,unit([1,0,0])],[booking.id,unit([0,1,0])]]);
 const e=keyedEngine([receipt,booking,...fillers],keyed,row=>vectors.get(row.id)??unit([0,.2,1]));
 const animation=await e.search({query:'receipt animation',kinds:['design'],subjects:['receipt animation']});
 assert.equal(animation.results[0].id,receipt.id);
 assert.equal(animation.results[0].match,'broader');
 assert.deepEqual(animation.results[0].evidence.subject,{via:['receipt'],matched_as:'broader',where:['title','description']});
 assert.equal(animation.search_coverage.subject_matches,0);
 assert.match(animation.notice,/No works show the subject \(receipt animation\); 1 shows only a broader reading \(receipt\)/);
 const card=await e.search({query:'flight card',kinds:['design'],subjects:['flight card']});
 assert.ok(!card.results.some(r=>r.id===booking.id&&r.match==='subject'),'the card of a flight card is a concept, never inferred');
});

test('a noun style label before a domain word and a domain label are not requested styles',async()=>{
 const lore={...work(1,'logo'),title:'Lore',description:'A pixel wordmark.',industry:'Gaming',styles:['Pixel art']};
 const reel={...work(2,'logo'),title:'Reel',description:'A film reel mark.',styles:['Video']};
 const clip={...work(3,'logo'),title:'Clip',description:'A clip mark.',styles:['Video'],industry:'Gaming'};
 const e=flat([lore,reel,clip]);
 const game=await e.search({query:'video game studio logo',kinds:['logo'],context:'gaming'});
 assert.equal(game.interpreted_query.derived_constraints?.style,undefined,'"video game" names the domain');
 assert.ok(evidencedIds(game).includes(lore.id));
});

test('style evidence is reported per requested style and orders works; it never relabels a subject',async()=>{
 const drawn={...work(1,'logo'),title:'Peach',description:'A brush-lettered food mark.',industry:'Food & Drink',styles:['Hand-drawn','Playful']};
 const round={...work(2,'logo'),title:'Drops',description:'Rounded food letters.',industry:'Food & Drink',styles:['Playful']};
 const other={...work(3,'logo'),title:'Hand drawn shop',description:'A hand-drawn shop sign.',styles:['Hand-drawn']};
 const e=flat([drawn,round,other]);
 const logos=await e.search({query:'hand-drawn playful logo for a snack food brand',kinds:['logo'],context:'food and drink'});
 const byId=Object.fromEntries(logos.results.map(r=>[r.id,r]));
 assert.equal(logos.results[0].id,drawn.id);
 assert.deepEqual(byId[drawn.id].evidence.style,{matched:['Hand-drawn','Playful']});
 assert.deepEqual(byId[round.id].evidence.style,{matched:['Playful'],unverified:['Hand-drawn']});
 assert.match(byId[round.id].reason,/Hand-drawn unverified/);
 assert.equal(logos.search_coverage.style_matches,1);
 const tabs=[{...work(4),title:'curved browser tabs',description:'Curved browser tabs.'},{...work(5),title:'colorful tabs',description:'Colorful playful browser tabs.',styles:['Colorful','Playful']}];
 const more=[6,7].map(n=>({...work(n),title:'Poster '+n,description:'A poster.',styles:['Colorful','Playful']}));
 const browser=await flat([...tabs,...more]).search({query:'playful colorful browser tabs',kinds:['design'],subjects:['browser tabs']});
 assert.deepEqual(evidencedIds(browser),[tabs[1].id,tabs[0].id],'explicit concrete subject: styles rank, never relabel');
 assert.deepEqual([...browser.results[1].evidence.style.unverified].sort(),['Colorful','Playful']);
});

test('absence notices count inflections and derivational relatives',async()=>{
 const print={...work(1),title:'Print Receipt',description:'A receipt card prints an order.'};
 const drop={...work(2),title:'Drop zone',description:'Dragging a file onto the drop zone.'};
 const e=flat([print,drop]);
 const receipt=await e.search({query:'receipt printing animation',subjects:['receipt']});
 assert.ok(!(receipt.interpreted_query.unmatched_terms??[]).includes('printing'));
 const upload=await e.search({query:'drag and drop file upload',subjects:['drop zone']});
 assert.ok(!(upload.interpreted_query.unmatched_terms??[]).includes('drag'));
});

test('a matched specific context carries the topic when the brief words are unsatisfiable',async()=>{
 const athlete={...work(1,'website'),title:'Driver',description:'A racing driver portfolio with portrait photography.',industries:['Sports']};
 const studio={...work(2,'website'),title:'Studio',description:'A studio portfolio.'};
 const result=await flat([athlete,studio]).search({query:'personal website for a professional athlete',kinds:['website'],context:'sports'});
 assert.deepEqual(result.results.map(r=>r.id),[athlete.id,studio.id]);
 assert.deepEqual(result.results[0].evidence.context,{matched:['sports']});
 assert.equal(result.search_coverage.brief_matches,1,'only the context-evidenced site counts as brief evidence');
 assert.ok(result.interpreted_query.unmatched_terms.includes('athlete'));
});

test('style words modifying a subject read from the wording only rank, and style evidence orders feature-noun briefs',async()=>{
 const plain={...work(1),title:'Tabs',description:'Navigation tabs morph between sections.'};
 const moving={...work(2),title:'Moving tabs',description:'Animated navigation tabs.',styles:['Animated']};
 const extra=[3,4].map(n=>({...work(n),title:'Poster '+n,description:'A poster.',styles:['Animated','Tactile']}));
 const tabs=await flat([plain,moving,...extra]).search({query:'animated navigation tabs',kinds:['design']});
 assert.ok(evidencedIds(tabs).includes(plain.id),'"animated navigation tabs" names a styled component');
 const soft={...work(5),title:'Glass button',description:'A glass button.'};
 const raised={...work(6),title:'Raised button',description:'A raised button.',styles:['Tactile']};
 const knobs=await flat([soft,raised,...extra]).search({query:'tactile hardware interface, physical buttons and knobs',kinds:['design']});
 assert.deepEqual(knobs.results.map(r=>r.id),[raised.id,soft.id]);
 assert.deepEqual(knobs.results[1].evidence.style,{unverified:['Tactile']});
 assert.match(knobs.results[1].reason,/Style Tactile unverified/);
});
