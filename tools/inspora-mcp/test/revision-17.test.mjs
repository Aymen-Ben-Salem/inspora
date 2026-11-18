// Search revision 17 (synthetic fixtures): searched kinds are never subjects, generic context
// parts need corroboration, tone words need a whole-work noun, thin pools continue with
// labelled near works, notices restate counts consistently, continuations keep their count.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work,embed,vector,admitted} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r17',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
const spread=works=>new SearchEngine({snapshotId:'r17-spread',capturedAt,model:{name:'Xenova/all-MiniLM-L6-v2'},rows:normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}))},{embed});

test('revision 17 is current',()=>assert.equal(SEARCH_REVISION,17));

test('a searched kind named in the wording is the work itself, not a subject or a contained feature',async()=>{
 const site={...work(1,'website'),title:'Quiet house',description:'A calm website lists services with serif headings.'};
 const page={...work(2),title:'Listing page',description:'A calm service listing page.'};
 const result=await flat([site,page]).search({query:'dignified calm funeral home website with service listings',kinds:['website','design'],context:'funeral services'});
 assert.deepEqual(result.interpreted_query.subjects,[]);
 assert.equal(result.interpreted_query.subject_scope,'primary');
 assert.equal(result.interpreted_query.derived_constraints?.subjects,undefined);
 assert.equal(result.interpreted_query.derived_constraints?.scope_reason,undefined);
 const icons=await flat([{...work(3,'icon'),title:'Calm icon',description:'A calm app icon.'}]).search({query:'calm app icon',kinds:['icon','design']});
 assert.equal(icons.interpreted_query.subject_scope,'primary','an icon search keeps icons as the work');
});

test('a context part naming no domain counts alone only with corroboration; the full phrase still counts',async()=>{
 const agency={...work(1,'website'),title:'Studio',description:'An agency site lists its services in bold type.'};
 const both={...work(2,'website'),title:'Rest',description:'A funeral home website describes its funeral services gently.'};
 const result=await flat([agency,both]).search({query:'calm website',kinds:['website'],context:'funeral services'});
 const byId=Object.fromEntries(result.results.map(r=>[r.id,r]));
 assert.deepEqual(byId[both.id].evidence.context.matched,['funeral','services']);
 assert.equal(byId[agency.id]?.evidence.context.matched,undefined,'"services" alone is another sense of the context');
 assert.equal(result.results[0].id,both.id);
 // A part that is a catalog domain (Fintech) stands on its own.
 const fin={...work(3,'website'),title:'Ledger',description:'A fintech dashboard site.',industries:['Fintech']};
 const other={...work(4,'website'),title:'Other',description:'A fintech landing page.',industries:['Fintech']};
 const domain=await flat([fin,other]).search({query:'website',kinds:['website'],context:'fintech startup'});
 assert.ok(domain.results.every(r=>r.evidence.context.matched?.includes('fintech')));
});

test('tone words count from labels or a whole-work noun, never from a small element',async()=>{
 const element={...work(1),title:'Meeting finder',description:'A white scheduling card with a date picker.',searchOnly:'A white card holds a date picker above a dark scheduling action.'};
 const prose={...work(2),title:'Date picker',description:'A date picker sits on a dark background.'};
 const predicate={...work(3),title:'Night picker',description:'A date picker whose interface is dark.'};
 const tagged={...work(4),title:'Range picker',description:'A date range picker.',styles:['Dark']};
 const result=await flat([element,prose,predicate,tagged,{...work(5),styles:['Dark']}]).search({query:'dark mode date picker',kinds:['design'],subjects:['date picker']});
 const style=Object.fromEntries(result.results.map(r=>[r.id,r.evidence.style]));
 assert.deepEqual(style[prose.id],{matched:['Dark']});
 assert.deepEqual(style[predicate.id],{matched:['Dark']});
 assert.deepEqual(style[tagged.id],{matched:['Dark']});
 assert.deepEqual(style[element.id],{unverified:['Dark']});
 assert.ok(!(result.interpreted_query.brief_terms??[]).includes('mode'),'"mode" belongs to the dark-mode cue');
 // A tone word that is no style label (light) is an appearance cue with the same rule.
 const lightUi={...work(6),title:'Admin dashboard',description:'An admin dashboard with a light interface.'};
 const beam={...work(7),title:'Sales dashboard',description:'A sales dashboard where a light beam crosses a black panel.'};
 const light=await flat([lightUi,beam]).search({query:'light mode dashboard',kinds:['design']});
 const lightStyle=Object.fromEntries(light.results.map(r=>[r.id,r.evidence.style]));
 assert.deepEqual(lightStyle[lightUi.id],{matched:['light']});
 assert.deepEqual(lightStyle[beam.id],{unverified:['light']});
 assert.deepEqual(light.interpreted_query.derived_constraints.appearance,['light']);
 assert.equal(light.search_coverage.style_matches,undefined,'appearance cues rank and report but never set style counts');
});

test('a thin evidence pool continues with labelled near works; empty or constrained pools do not',async()=>{
 const evidenced=[{...work(1,'logo'),title:'Slab',description:'An oversized wordmark with heavy letters.',industries:['Music']},.95];
 const near=Array.from({length:30},(_,i)=>[{...work(10+i,'logo'),title:'Mark '+i,description:'A compact symbol.'},.9-i*.01]);
 const e=spread([evidenced,...near]);
 // A soft context keeps the brief from being a criteria-free browse.
 const result=await e.search({query:'oversized heavy letters',kinds:['logo'],context:'music'});
 assert.equal(admitted(result).length,1);
 assert.equal(result.search_coverage.similar_fill,19,'two pages minus the evidenced work');
 assert.ok(result.results.slice(1).every(r=>r.match==='similar'&&r.evidence.meaning_top_pct!==undefined));
 assert.equal(result.results[1].id,near[0][0].id,'near works follow meaning order');
 assert.match(result.notice,/19 more works are added as the closest by meaning only \(match similar/);
 // Explicit hard constraints keep the honest short list.
 const strict=await e.search({query:'oversized heavy letters',kinds:['logo'],context:'music',required_terms:['oversized']});
 assert.equal(strict.search_coverage.similar_fill,undefined);
 // Several explicit kinds: a kind without evidence is still represented by its closest works.
 const designs=Array.from({length:12},(_,i)=>[{...work(60+i),title:'Print '+i,description:'Oversized heavy letters fill a print.',industries:['Cinema']},.6]);
 const mixed=await spread([...near,...designs]).search({query:'oversized heavy letters',kinds:['design','logo'],context:'cinema'});
 assert.equal(mixed.search_coverage.matching_by_kind.logo,3);
 assert.equal(mixed.search_coverage.similar_fill,3);
 assert.ok(mixed.results.filter(r=>r.kind==='logo').every(r=>r.match==='similar'));
});

test('notices restate counts without contradiction and adjectives are ranking-only words',async()=>{
 const both={...work(1),title:'Calm one',description:'A playful retro poster.',styles:['Playful','Retro']};
 const one={...work(2),title:'Calm two',description:'A playful poster.',styles:['Playful']};
 const retro={...work(3),title:'Old',description:'A faded print.',styles:['Retro']};
 const result=await flat([both,one,retro]).search({query:'playful retro serene poster',kinds:['design']});
 assert.equal(result.search_coverage.style_matches,1);
 assert.equal(result.search_coverage.partial_style_matches,2);
 assert.doesNotMatch(result.notice,/whole brief|No catalog work mentions/);
 assert.match(result.notice,/Not found in any work's text \(ranking only\): serene/);
});

test('a cursor-only continuation keeps the original page size',async()=>{
 const rows=Array.from({length:30},(_,i)=>({...work(i+1),title:'Blue panel '+i,description:'A blue glass panel.'}));
 const e=flat(rows);
 const first=await e.search({query:'blue panel',kinds:['design'],count:12});
 assert.equal(first.results.length,12);
 const next=await e.search({cursor:first.next_cursor});
 assert.equal(next.requested,12);
 assert.equal(next.results.length,12);
 const again=await e.search({cursor:first.next_cursor});
 assert.deepEqual(again.results.map(r=>r.id),next.results.map(r=>r.id),'the continuation stays re-readable');
 const resized=await e.search({cursor:first.next_cursor,count:5});
 assert.equal(resized.results.length,5,'an explicit count still applies');
});

// Gate fixes after the revision 17 blind gate.
test('every work passing explicit filters stays returnable, labelled browse after the evidenced ones',async()=>{
 const finance=[1,2,3].map(n=>({...work(n,'logo'),title:'Mark '+n,description:'A geometric mark.',industries:['Finance']}));
 const others=Array.from({length:5},(_,i)=>({...work(10+i,'logo'),title:'Other '+i,description:'A geometric mark.'}));
 const e=spread([...finance.map((row,i)=>[row,.4+i*.01]),...others.map(row=>[row,.9])]);
 const result=await e.search({query:'logo for a finance company',kinds:['logo'],filters:{industries:['Finance']}});
 assert.equal(result.search_coverage.filtered_works,3);
 assert.deepEqual(result.results.map(r=>r.id).sort(),finance.map(r=>r.id).sort(),'the whole filtered pool is returned');
 assert.ok(result.results.every(r=>['brief','browse','similar'].includes(r.match)));
 assert.doesNotMatch(result.notice,/No specific criteria were applied/);
 const dark=Array.from({length:25},(_,i)=>({...work(30+i),title:'Panel '+i,description:'A compact panel.',styles:['Dark']}));
 const plain=Array.from({length:5},(_,i)=>({...work(60+i),title:'Plain '+i,description:'A compact panel.'}));
 const e2=flat([...dark,...plain]);
 const first=await e2.search({query:'dark interface',kinds:['design'],filters:{styles:['Dark']}});
 assert.equal(first.results.length,10);
 assert.equal(first.search_coverage.matching_works,25,'all 25 filtered works are reachable');
 assert.doesNotMatch(first.notice,/No specific criteria were applied/);
 let seen=first.results.length,cursor=first.next_cursor;
 while(cursor){const page=await e2.search({cursor});seen+=page.results.length;cursor=page.next_cursor;}
 assert.equal(seen,25);
 const checked=await flat([{...work(90),title:'Checkbox',description:'A checkbox list.'},work(91)]).search({query:'checkbox',kinds:['design'],required_terms:['checkbox']});
 assert.doesNotMatch(checked.notice,/No specific criteria were applied/,'required terms are criteria');
 // Explicit subjects stay mandatory even inside a filtered pool.
 const strict=await e2.search({query:'dark toggle',kinds:['design'],subjects:['toggle'],filters:{styles:['Dark']}});
 assert.equal(strict.results.length,0);
});

test('appearance words rank and report but never create a shortage or cut brief matches',async()=>{
 const airy=Array.from({length:12},(_,i)=>({...work(i+1),title:'Calm screen '+i,description:'A minimal interface with generous whitespace and light grey type.',styles:['Minimal'],colors:i%2?['White']:['Gray']}));
 const e=flat(airy);
 const light=await e.search({query:'light airy minimal interface with lots of whitespace',kinds:['design']});
 assert.equal(light.insufficient_matches,false);
 assert.ok(light.search_coverage.brief_matches>=10);
 assert.doesNotMatch(light.notice,/every requested style \([^)]*light/);
 const style=light.results.map(r=>r.evidence.style);
 assert.ok(style.some(s=>s.matched?.includes('light')),'White taxonomy colour evidences light');
 // Monochrome: its own words, black-and-white phrases or a neutral-only palette.
 const mono=[
  {...work(40,'website'),title:'Overmind',description:'A monochrome pixel-art website with strong typography.'},
  {...work(41,'website'),title:'Primora',description:'A black-and-white editorial website with strong typography.'},
  {...work(42,'website'),title:'Neutral',description:'An editorial website with strong typography.',colors:['Black','White']},
  {...work(43,'website'),title:'Colour',description:'An editorial website with strong typography.',colors:['Black','Red']},
 ];
 const m=await flat(mono).search({query:'monochrome black and white website with strong typography',kinds:['website']});
 const ms=Object.fromEntries(m.results.map(r=>[r.id,r.evidence.style]));
 for(const id of [mono[0].id,mono[1].id,mono[2].id])assert.ok(ms[id]?.matched?.includes('monochrome'),id);
 assert.ok(ms[mono[3].id]&&!ms[mono[3].id].matched?.includes('monochrome'),'a red palette is not monochrome');
 assert.deepEqual(m.interpreted_query.derived_constraints.appearance,['monochrome']);
 assert.ok(!(m.interpreted_query.derived_constraints.style??[]).includes('monochrome'));
});
