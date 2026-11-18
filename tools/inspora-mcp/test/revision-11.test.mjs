// Search revision 11: evidence honesty for modifiers, compounds, page types, styles and
// multiple subjects (synthetic fixtures, not blind-evaluation wording).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {tokens,inflections,subjectTerms,queryIntent} from '../relevance.mjs';
import {work,embed,vector,evidencedIds} from './fixtures.mjs';

const flat=works=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'r11',capturedAt,rows},{embed});};
const site=(n,extra)=>({...work(n,'website'),title:'Site '+n,description:'A studio website with large type.',...extra});

test('negated compounds are their own terms and inflections only expand requested base words',()=>{
 assert.deepEqual(tokens('sans-serif and sans serif headings'),['sansserif','heading']);
 assert.ok(!tokens('a non-profit portal').includes('profit'));
 // Revision 13: only a requested base word expands to its inflections; lexicalised -ing
 // nouns (buildings, landings) and requested -ing words are never reduced.
 assert.ok(inflections('send').includes('sending'));
 assert.ok(inflections('toggle').includes('toggled'));
 assert.deepEqual(inflections('booking'),['booking']);
 assert.ok(!inflections('land').includes('landing'));
 assert.ok(!inflections('build').includes('building'));
});

test('a multi-word subject shows as the subject only when its modifiers are evidenced',async()=>{
 const mark={...work(1,'logo'),title:'Arc',description:'An animated reveal of a geometric mark.'};
 const button={...work(2),title:'Pulse',description:'An animated button pulses on hover.'};
 const product={...work(3),title:'Item tile',description:'A product card shows a price and an add button.'};
 const plain={...work(4),category:'Product',title:'Task tile',description:'A card lists open tasks.'};
 const e=flat([mark,button,product,plain]);
 const animation=await e.search({query:'logo animation',subjects:['logo animation'],kinds:['design','logo']});
 assert.deepEqual(animation.results.map(r=>r.id),[mark.id],'the kind evidences the logo modifier; a bare animation is not the subject');
 assert.equal(animation.results[0].match,'subject');
 const card=await e.search({query:'product card',subjects:['product card'],kinds:['design']});
 assert.deepEqual(card.results.filter(r=>r.match==='subject').map(r=>r.id),[product.id],'the Product format category is not modifier evidence');
 assert.deepEqual(subjectTerms('page transition'),['page','transition'],'a format noun as modifier is required');
 assert.deepEqual(subjectTerms('welcome screen'),['welcome'],'a format noun as head is not');
});

test('an alias that adds another concept keeps that concept as a requirement',async()=>{
 const form={...work(1),title:'Pay form',description:'A payment form collects card details.'};
 const receipt={...work(2),title:'Receipt',description:'A payment receipt prints line items.'};
 const result=await flat([form,receipt]).search({query:'payment form',subjects:['payment form']});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[form.id,'subject'],[receipt.id,'broader']]);
});

test('a page-type subject on websites is the website kind, ranked by the context',async()=>{
 const rows=[site(1,{industries:['Fintech'],description:'A fintech website with large type.'}),site(2,{industries:['Fintech']}),site(3),site(4)];
 const result=await flat(rows).search({query:'trustworthy homepage',kinds:['website'],context:'fintech'});
 assert.equal(result.search_coverage.matching_works,4,'no website is cut by the page-type subject');
 assert.equal(result.results[0].id,rows[0].id);
 assert.equal(result.search_coverage.context_matches,2);
});

test('requested style evidence lifts matching works above otherwise equal ones',async()=>{
 const light={...work(1),title:'Board A',description:'A dashboard of weekly metrics.',styles:['Minimal']};
 const dark={...work(2),title:'Board B',description:'A dashboard of weekly metrics.',styles:['Dark']};
 const more=[3,4].map(n=>({...work(n),title:'Other '+n,description:'A poster.',styles:['Dark']}));
 // Styles rank and are reported per result as evidence; they never filter.
 const result=await flat([light,dark,...more]).search({query:'dark dashboard',subjects:['dashboard']});
 assert.deepEqual(evidencedIds(result),[dark.id,light.id]);
 assert.deepEqual(result.results[1].evidence.style,{unverified:['Dark']});
 assert.match(result.results[1].reason,/Style Dark unverified/);
});

test('works matching more of several subjects rank first and a second subject is not buried',async()=>{
 const both={...work(1),title:'Combo',description:'A chart beside a toggle.'};
 const charts=[2,3,4].map(n=>({...work(n),title:'Chart '+n,description:'A chart of revenue with chart labels.'}));
 const toggle={...work(5),title:'Switch',description:'A toggle flips a setting.'};
 const result=await flat([both,...charts,toggle]).search({query:'chart or toggle',subjects:['chart','toggle']});
 assert.equal(result.results[0].id,both.id);
 assert.ok(result.results.slice(0,3).some(r=>r.id===toggle.id));
});

test('product-role evidence also counts for a context naming that role',async()=>{
 const tool={...site(1),description:'A developer tool website for code review.'};
 const result=await flat([tool,site(2),site(3)]).search({query:'developer tool landing page',kinds:['website'],context:'DevTools'});
 assert.equal(result.results[0].id,tool.id);
 assert.equal(result.search_coverage.context_matches,1);
});

test('brief words no eligible work uses are reported as unmatched',async()=>{
 const result=await flat([{...work(1,'logo'),title:'Wave',description:'A retro wave logo.'}]).search({query:'retro podcast logo',kinds:['logo']});
 assert.deepEqual(result.interpreted_query.unmatched_terms,['podcast']);
 assert.match(result.notice,/No catalog work mentions podcast/);
});

test('a familiar synonym phrase maps to its concept',()=>{
 assert.deepEqual(queryIntent({subjects:['toggle switch']},'animated toggle switch',new Set()).subjects,['toggle']);
 assert.deepEqual(queryIntent({subjects:['pricing page']},'pricing page',new Set()).subjects,['pricing']);
});
