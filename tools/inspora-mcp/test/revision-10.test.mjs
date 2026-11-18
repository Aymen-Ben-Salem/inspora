// Search revision 10: general admission mechanisms (synthetic fixtures, not QA brief wording).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows,clean} from '../catalog.mjs';
import {prepareSearchQuery,untranslatedLanguage} from '../query.mjs';
import {tokens,subjectFallbacks,queryIntent} from '../relevance.mjs';
import {work,embed,vector} from './fixtures.mjs';

const flat=(works,options={})=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works}).map(row=>({...row,vector:vector()}));return new SearchEngine({snapshotId:'r10',capturedAt,rows},{embed,...options});};
// Each work's similarity to the (constant) query embedding is set explicitly.
const at=s=>[s,Math.sqrt(1-s*s),...Array(382).fill(0)];
const spread=(works,model={name:'Xenova/all-MiniLM-L6-v2'})=>{const capturedAt=new Date().toISOString();const rows=normalizeRows({capturedAt,rows:works.map(([row])=>row)}).map((row,i)=>({...row,vector:at(works[i][1])}));return new SearchEngine({snapshotId:'r10-spread',capturedAt,model,rows},{embed});};
const filler=n=>Array.from({length:n},(_,i)=>[{...work(100+i),title:'Filler '+i,description:'A small study of shapes number '+i+'.'},.05+.002*i]);

test('typo correction leaves real English words and still fixes non-words',()=>{
 const df=new Map([['bottle',4],['poster',5]]);
 assert.deepEqual(prepareSearchQuery({query:'battle poster'},df).corrections,[],'battle is a real word one edit from bottle');
 assert.deepEqual(prepareSearchQuery({query:'bottel poster'},df).corrections,[{from:'bottel',to:'bottle'}]);
 assert.deepEqual(prepareSearchQuery({query:'harbours poster'},df).corrections,[],'inflected real words are known through their base');
});

test('untranslated Latin-script briefs request a rewrite while English with loanwords searches',async()=>{
 for(const query of ['affiche pour une boulangerie et un café','cartel para una panadería con estilo','Plakat für eine Bäckerei mit Logo','manifesto per una pasticceria della città','cartaz para uma padaria com logotipo'])
  assert.ok(untranslatedLanguage(query),query);
 for(const query of ['café logo with art deco lettering','de Stijl poster with primary colors','fintech startup landing page'])
  assert.equal(untranslatedLanguage(query),null,query);
 const e=flat([{...work(1),title:'Bakery poster',description:'A bakery poster.'}]);
 await assert.rejects(e.search({query:'affiche pour une boulangerie'}),/QUERY_REWRITE_REQUIRED/);
 assert.equal((await e.search({query:'café bakery poster'})).results.length,1);
});

test('context without catalog evidence is reported as a shortage and evidenced context ranks first',async()=>{
 const plain=[1,2,3].map(i=>({...work(i,'logo'),title:'Mark '+i,description:'A bold geometric logo.'}));
 const none=await flat(plain).search({query:'bold logo',kinds:['logo'],context:'aviation'});
 assert.equal(none.results.length,3,'context stays a soft preference');
 assert.equal(none.search_coverage.context_matches,0);
 assert.match(none.notice,/No works show the whole brief: 3 show most brief terms \(bold\), 0 show the context \(aviation\)\./);
 const wing={...work(9,'logo'),title:'Wing',description:'A bold geometric logo.',industries:['Aviation']};
 const some=await flat([...plain,wing]).search({query:'bold logo',kinds:['logo'],context:'aviation'});
 assert.equal(some.results[0].id,wing.id);
 assert.equal(some.search_coverage.context_matches,1);
 assert.match(some.notice,/1 shows the context \(aviation\)/,'one evidenced work among padding still carries the count');
 const jet={...work(10,'logo'),title:'Jet',description:'A bold geometric logo.',industries:['Aviation']};
 const enough=await flat([...plain,wing,jet]).search({query:'bold logo',kinds:['logo'],context:'aviation'});
 assert.equal(enough.search_coverage.context_matches,2);
 assert.doesNotMatch(enough.notice,/requested context/);
});

test('query words restating an applied filter do not gate or dilute the filtered works',async()=>{
 const sites=[1,2,3].map(i=>({...work(i,'website'),title:'Site '+i,description:'A portfolio of photographs.',technologies:['Astro']}));
 const e=flat([...sites,{...work(4,'website'),title:'Other',description:'A portfolio of photographs.'}]);
 const result=await e.search({query:'site made with Astro',kinds:['website'],filters:{technologies:['Astro']}});
 assert.deepEqual(new Set(result.results.map(r=>r.id)),new Set(sites.map(r=>r.id)));
 assert.deepEqual(result.interpreted_query.derived_constraints.restated_by_filters,['astro']);
});

test('meaning alone admits only standout works, matched as similar, and never on a flat distribution',async()=>{
 const standout=[{...work(1),title:'Quiet slab',description:'Heavy concrete forms in grey.'},.9];
 const e=spread([standout,...filler(120)]);
 const result=await e.search({query:'stark monolithic composition',kinds:['design']});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[standout[0].id,'similar']]);
 assert.match(result.results[0].reason,/Similar overall description/);
 assert.equal(result.results[0].evidence.meaning_top_pct,1);
 assert.equal(result.search_coverage.brief_matches,0);
 assert.equal(result.insufficient_matches,true);
 assert.match(result.notice,/No catalog work mentions stark, monolithic, composition/);
 const level=flat([standout[0],...filler(20).map(([row])=>row)]);
 assert.equal((await level.search({query:'stark monolithic composition',kinds:['design']})).results.length,0);
});

test('multi-word subjects degrade to the concepts and specific words they contain, below exact matches',async()=>{
 assert.deepEqual(subjectFallbacks('nav strip'),['navigation','strip'],'a word outside the contained concept is a generic fallback');
 assert.deepEqual(subjectFallbacks('signup screen'),['login'],'format nouns need no evidence');
 assert.deepEqual(subjectFallbacks('logo animation'),['logo','animation'],'each specific word is a weaker fallback');
 assert.deepEqual(subjectFallbacks('pricing table'),['pricing'],'a listed concept falls back to its modifier, not another sense of its head');
 const exact={...work(1),title:'Nav strip',description:'A nav strip slides between sections.'};
 const tabs={...work(2),title:'Tab bar',description:'A tab bar switches between sections.'};
 const poster={...work(3),title:'Poster',description:'A poster with sections.'};
 const result=await flat([exact,tabs,poster]).search({query:'nav strip',subjects:['nav strip'],kinds:['design']});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[exact.id,'subject'],[tabs.id,'broader']]);
 assert.deepEqual(result.interpreted_query.subject_fallbacks,['navigation']);
 const plan={...work(4),title:'Plan picker',description:'A pricing plan component lists tiers.'};
 const grid={...work(5),title:'Data grid',description:'A data table of orders.'};
 const pricing=await flat([plan,grid]).search({query:'pricing table',subjects:['pricing table']});
 assert.deepEqual(pricing.results.map(r=>[r.id,r.match]),[[plan.id,'broader']]);
 assert.deepEqual(pricing.results[0].evidence.subject,{via:['pricing'],matched_as:'broader',where:['title','description']});
});

test('adjacent concepts form one compound subject instead of dropping the modifier',()=>{
 assert.deepEqual(queryIntent({},'checkout button component',new Set()).subjects,['checkout button']);
 assert.deepEqual(queryIntent({},'checkout or button',new Set()).subjects,['checkout','button']);
});

test('default primary scope appends public supporting-feature mentions after main-subject matches',async()=>{
 const main={...work(1),title:'Revenue chart',description:'A chart of monthly revenue.'};
 const within={...work(2),title:'Sales overview',description:'A dashboard shows a weekly chart beside account totals.'};
 const hidden={...work(3),title:'Profile panel',description:'A profile panel lists account details.',searchOnly:'A chart sits in the background.'};
 const e=flat([main,within,hidden]);
 const result=await e.search({query:'chart'});
 assert.deepEqual(result.results.map(r=>[r.id,r.match]),[[main.id,'subject'],[within.id,'contains']]);
 assert.equal(result.search_coverage.subject_matches,1);
 assert.deepEqual(result.search_coverage.weaker_subject_matches,{contains:1});
 assert.deepEqual((await e.search({query:'chart',count:1})).results.map(r=>r.id),[main.id],'no fallback when direct matches fill the page');
 assert.ok(!(await e.search({query:'chart',subject_scope:'primary'})).results.some(r=>r.match==='contains'),'an explicit scope is honoured');
});

test('filler and hedging words carry no matching weight',()=>{
 assert.deepEqual(tokens('something kinda like a cool lantern poster but nice vibe'),['lantern','poster']);
});

test('reference searches keep their six best works plus the top fifth of their own distribution',async()=>{
 const reference={...work(1),title:'Reference',description:'A reference work.'};
 const others=Array.from({length:40},(_,i)=>[{...work(10+i),title:'Neighbour '+i,description:'A neighbouring work.'},.4+.012*i]);
 const e=spread([[reference,1],...others]);
 const result=await e.search({reference_url:'https://www.inspora.design/posts/sample-1',count:20});
 assert.ok(result.search_coverage.matching_works>=6&&result.search_coverage.matching_works<=10,String(result.search_coverage.matching_works));
 const level=flat([reference,...others.map(([row])=>row)]);
 assert.equal((await level.search({reference_url:'https://www.inspora.design/posts/sample-1',count:20})).search_coverage.matching_works,40,'a flat distribution keeps every gated work');
});

test('free-text colours and negations rank instead of filtering and are reported',async()=>{
 const red={...work(1),title:'Red poster',description:'A red festival poster.'};
 const blue={...work(2),title:'Blue poster',description:'A blue festival poster.'};
 const photo={...work(3),title:'Photo poster',description:'A festival poster with photos.'};
 const e=flat([red,blue,photo]);
 const colored=await e.search({query:'red festival poster'});
 assert.equal(colored.results[0].id,red.id);
 assert.ok(colored.results.some(r=>r.id===blue.id),'colour words in text are a preference');
 assert.deepEqual(colored.interpreted_query.derived_constraints.colors,['red']);
 // Revision 13: a negation read from the text ranks last and is reported; exclude_terms stay hard.
 const negated=await e.search({query:'festival poster without photos'});
 assert.equal(negated.results.at(-1).id,photo.id);
 assert.deepEqual(negated.results.at(-1).evidence.mentions_excluded,['photos']);
 assert.match(negated.results.at(-1).reason,/excluded photos/);
 assert.deepEqual(negated.interpreted_query.derived_constraints.excluded,['photos']);
 assert.ok(!(await e.search({query:'festival poster',exclude_terms:['photos']})).results.some(r=>r.id===photo.id));
 assert.deepEqual((await e.search({query:'festival poster',filters:{colors:['Red']}})).results,[],'explicit filters stay hard');
});

test('display excerpts end at a word boundary with an ellipsis while stored text keeps the plain cut',()=>{
 assert.equal(clean('alpha beta gamma delta',14,true),'alpha beta…');
 assert.equal(clean('alpha beta gamma delta',14),'alpha beta gam');
 assert.equal(clean('short',14,true),'short');
});
