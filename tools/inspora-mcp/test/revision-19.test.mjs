// Search revision 19 (synthetic fixtures): compound domain words reach the label their stem
// begins, widely spread words are no domain evidence alone, curated evidence (a subject in the
// title, a taxonomy word) clears the easier of two bars, inferred subjects read from a "for" or
// "with" clause are the domain or a feature, descriptive suffixes are no brief words, earthy has
// equivalents, and context notices describe what the counted works carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine,SEARCH_REVISION} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {queryIntent} from '../relevance.mjs';
import {constraints} from '../query.mjs';
import {work,embed,vector} from './fixtures.mjs';

const capturedAt=new Date().toISOString();
const flat=works=>new SearchEngine({snapshotId:'r19',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}))},{embed});
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
// Hosted model gates (query .62, concrete .55): similarity is set per work.
const bge=works=>new SearchEngine({snapshotId:'r19-bge',capturedAt,model:{name:'@cf/baai/bge-small-en-v1.5'},rows:normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}))},{embed});
const filler=(from,n,similarity,kind='design')=>Array.from({length:n},(_,i)=>[{...work(from+i,kind),title:'Filler '+i,description:'An unrelated composition.'},similarity]);

test('revision 19 or later is current',()=>assert.ok(SEARCH_REVISION>=19));

test('a compound domain word in the brief reaches the label its stem begins',async()=>{
 const keyed=text=>{const t=text.toLowerCase();return t==='fintech'?[.9,.44,0]:/financ/.test(t)?[.85,.5,0]:/sport/.test(t)?[0,1,0]:/music/.test(t)?[0,0,1]:/fine art/.test(t)?[.1,.2,.97]:[.2,.2,.96];};
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(381).fill(0)];};
 const labels=['Finance','Sports','Music','Fine Art','Travel','Food','Health','Retail','Gaming','Education','Fashion'];
 const works=labels.map((label,i)=>({...work(i+1,'logo'),title:'Mark '+i,description:'A minimal logo.',industries:[label]}));
 const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:unit([.3,.3,.9])}));
 const result=await new SearchEngine({snapshotId:'compound',capturedAt,rows},{embed:async texts=>texts.map(text=>unit(keyed(text)))}).search({query:'fintech logo',kinds:['logo']});
 const finance=result.results.find(item=>item.title==='Mark 0');
 assert.equal(result.results[0].title,'Mark 0');
 assert.deepEqual(finance.evidence.brief_terms.matched,['fintech']);
 assert.ok(!result.results.find(item=>item.title==='Mark 3')?.evidence.brief_terms?.matched,'Fine Art shares the stem but not the meaning');
 assert.ok(!(result.interpreted_query.unmatched_terms??[]).includes('fintech'));
});

test('a widely spread word found alone carries no ranking weight with a domain brief, but is reported as matched',async()=>{
 // "mobile" spreads across every domain of this catalog; "banking" is one domain.
 const domains=['Travel','Food','Health','Retail','Gaming','Education','Fashion','Music','Sports','Media','Energy','Legal'];
 const spread=domains.map((label,i)=>({...work(i+1),title:'Mobile '+label.toLowerCase()+' screen',description:'A mobile screen for '+label.toLowerCase()+'.',industries:[label]}));
 const bank={...work(20),title:'Account card',description:'A mobile banking card shows the balance.',industries:['Banking']};
 const result=await flat([...spread,bank]).search({query:'mobile banking app',kinds:['design'],context:'banking'});
 assert.equal(result.results[0].id,bank.id);
 assert.deepEqual(result.results[0].evidence.brief_terms,{matched:['mobile']},'beside the context the spread word counts');
 for(const item of result.results.filter(item=>item.id!==bank.id))assert.deepEqual(item.evidence.brief_terms,{matched:['mobile'],generic:['mobile']},'alone it is shown, flagged and unweighted');
 assert.equal(result.search_coverage.term_matches,13,'counts state what is shown');
});

test('proptech reaches Real Estate and insurtech-style words choose the label their domain words agree on',async()=>{
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(380).fill(0)];};
 const keyed=text=>{const t=text.toLowerCase();
  return t==='proptech'?[.2,.9,.1,0]:t==='property'?[.1,.85,.1,0]:t==='propeller'?[.9,.1,0,0]:/real estate/.test(t)?[0,1,0,0]:/aviation/.test(t)?[1,0,0,0]:/music/.test(t)?[0,0,1,0]:[0,0,0,1];};
 const labels=['Real Estate','Aviation','Music','Sports'];
 const works=labels.map((label,i)=>({...work(i+1,'logo'),title:'Mark '+i,description:'A minimal logo.',industries:[label]}));
 const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:unit([.3,.3,.3,.8])}));
 const result=await new SearchEngine({snapshotId:'prop',capturedAt,rows},{embed:async texts=>texts.map(text=>unit(keyed(text)))}).search({query:'minimal logo',kinds:['logo'],context:'proptech'});
 assert.equal(result.search_coverage.context_matches,1);
 assert.equal(result.results[0].title,'Mark 0');
 assert.deepEqual(result.results[0].evidence.context,{matched:['proptech']});
});

test('a one-word and a two-word compound domain behave the same',async()=>{
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(381).fill(0)];};
 const keyed=text=>{const t=text.toLowerCase();return /^healthtech$|^healthcare$|health tech/.test(t)?[1,.1,0]:/music/.test(t)?[0,1,0]:[0,0,1];};
 const works=[{...work(1),title:'Clinic app',description:'A patient portal.',industries:['Healthcare']},{...work(2),title:'Care tracker',description:'A wellness tracker.',industries:['Health tech']},{...work(3),title:'Player',description:'A music player.',industries:['Music']}];
 const engine=new SearchEngine({snapshotId:'join',capturedAt,rows:normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:unit([.5,.5,.7])}))},{embed:async texts=>texts.map(text=>unit(keyed(text)))});
 const one=await engine.search({query:'app screen',kinds:['design'],context:'healthtech'});
 const two=await engine.search({query:'app screen',kinds:['design'],context:'health tech'});
 assert.deepEqual(two.results.map(item=>[item.id,item.evidence.context]),one.results.map(item=>[item.id,item.evidence.context]));
 assert.equal(one.search_coverage.context_matches,2);
});

test('the with-subject context count names main-subject matches only',async()=>{
 const sidebars=[1,2,3].map(i=>({...work(i),title:'Sidebar '+i,description:'A sidebar with navigation links.'}));
 const saas=[4,5].map(i=>({...work(i),title:'SaaS dashboard '+i,description:'A SaaS analytics dashboard with a small sidebar.',industries:['SaaS']}));
 const result=await flat([...sidebars,...saas]).search({query:'sidebar navigation for a SaaS app',kinds:['design'],subjects:['sidebar'],context:'SaaS'});
 assert.equal(result.search_coverage.context_with_subject,0);
 assert.match(result.notice,/main-subject|main subject/);
});

test('a requested subject named in the work\'s title clears the concrete floor even below the typical similarity',async()=>{
 const nav={...work(1),title:'morphing nav bar',description:'A translucent navigation pill expands the selected item into a labeled capsule.'};
 const prose={...work(2),title:'Capsule',description:'A pill whose shapes morph between states.'};
 // Most works sit at .60, so the typical similarity is above the .55 concrete floor.
 const result=await bge([[nav,.565],[prose,.565],...filler(10,12,.60)]).search({query:'morphing animation',kinds:['design'],subjects:['morph']});
 const subject=result.results.filter(item=>item.match==='subject').map(item=>item.id);
 assert.ok(subject.includes(nav.id),'title evidence is curated');
 assert.ok(!subject.includes(prose.id),'prose alone still needs the typical similarity');
});

test('a concept read only from a "for" clause is the domain, one read only from a "with" clause a feature',()=>{
 const domain=queryIntent({query:'logo for a payments brand',kinds:['logo']},'logo for a payments brand',new Set());
 assert.ok(!domain.subjects.includes('payment'));
 const feature=queryIntent({query:'ordering interface with item cards and prices',kinds:['design']},'ordering interface with item cards and prices',new Set());
 assert.deepEqual(feature.subjects,['card']);
 assert.equal(feature.subject_scope,'contains');
 const head=queryIntent({query:'pricing card for a fitness app',kinds:['design']},'pricing card for a fitness app',new Set());
 assert.equal(head.subject_scope,'primary','a subject named first stays the main subject');
});

test('a descriptive suffix names its first word and is no brief word',()=>{
 assert.equal(constraints('bold typography-led editorial website').positive,'bold typography editorial website');
 assert.equal(constraints('a mobile-first, data-driven dashboard').positive,'a mobile, data dashboard');
 assert.equal(constraints('an e-commerce checkout').positive,'an e-commerce checkout');
});

test('earthy is met by earth-toned prose or earth colours, never by a globe',async()=>{
 // Appearance words rank and report; the works share "muted", which admits them.
 const toned={...work(1,'website'),title:'Son',description:'An earth-toned portfolio with muted photography.'};
 const palette={...work(2,'website'),title:'Clay',description:'A muted studio site.',colors:['Terracotta','Beige']};
 const globe={...work(3,'website'),title:'Orbit',description:'A muted spinning earth globe on a dark page.'};
 const result=await flat([toned,palette,globe]).search({query:'muted earthy website',kinds:['website']});
 assert.deepEqual(result.interpreted_query.derived_constraints.appearance,['muted','earthy']);
 const style=id=>result.results.find(item=>item.id===id).evidence.style;
 assert.ok(style(toned.id).matched.includes('earthy'));
 assert.ok(style(palette.id).matched.includes('earthy'));
 assert.ok(style(globe.id).unverified.includes('earthy'));
});

test('related context notices name only the related domains the counted works carry',async()=>{
 // The context is close in meaning to two works that carry no related domain label.
 const keyed=text=>{const t=text.toLowerCase();return /restaurant/.test(t)?[1,0,0]:/travel/.test(t)?[0,1,0]:[0,0,1];};
 const unit=v=>{const n=Math.hypot(...v);return [...v.map(x=>x/n),...Array(381).fill(0)];};
 const near=[...Array(2)].map((_,i)=>({...work(i+1),title:'Menu '+i,description:'A dropdown menu with nested items.'}));
 const rest=[...Array(18)].map((_,i)=>({...work(i+10),title:'Other '+i,description:'A dropdown menu with nested items.',industries:['Travel']}));
 const rows=normalizeRows({capturedAt,rows:[...near,...rest]}).map((row,i)=>({...row,vector:unit(i<2?[.9,0,.1]:[0,.2,.9])}));
 const result=await new SearchEngine({snapshotId:'notice',capturedAt,rows},{embed:async texts=>texts.map(text=>unit(keyed(text)))}).search({query:'dropdown menu',kinds:['design'],context:'restaurant'});
 for(const item of result.results.slice(0,2))if(item.evidence.context&&!item.evidence.context.matched)assert.equal(item.evidence.context.close_in_meaning,true);
 if(result.search_coverage.context_related)assert.doesNotMatch(result.notice,/related domains: (?!Travel)/);
});
