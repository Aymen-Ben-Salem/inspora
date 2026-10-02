import {describe,it,expect} from 'vitest';
import {buildReleaseContentPlan} from './release-content-plan';
import {D1,EXCLUDED_WEBSITE_ID,type ContentSnapshot} from './content-transfer-plan';
const empty=():ContentSnapshot=>({capturedAt:'',rows:{creators:[],creator_username_aliases:[],logos:[],logo_media:[],websites:[],website_media:[],website_sections:[]},tableHashes:{},schema:[],ledger:[],constraints:[],indexes:[]});
const profile=(id:string,username:string|null)=>({id,name:id,handle:null,username,has_owner:false,has_verified_x:false,record_origin:'mirrored'});
const make=()=>{const s=empty(),d=empty();s.rows.creators=[profile(D1.survivor,'cabralorenzo'),profile('new','new_name'),profile('unrelated','unused')];d.rows.creators=[profile(D1.survivor,null)];s.rows.logos=[{id:D1.auric,slug:'auric',creator_id:D1.survivor},{id:'logo2',slug:'new-logo',creator_id:'new'}];s.rows.logo_media=s.rows.logos.map(l=>({id:'m'+l.id,logo_id:l.id,url:'https://preview.example/'+l.id,storage_key:l.id}));s.rows.creator_username_aliases=s.rows.creators.map(c=>({id:'a'+c.id,creator_id:c.id,username:c.username,is_current:true}));return{s,d};};
const options={sourceHost:'preview.example',destinationHost:'rehearsal.example'};
describe('bounded release content',()=>{
 it('preserves the production survivor and imports only selected-work creators and assets',()=>{
  const {s,d}=make(),p=buildReleaseContentPlan(s,d,options);
  expect(p.inserts.creators.map(r=>r.id)).toEqual(['new']);
  expect(p.profileUpdates).toEqual([{id:D1.survivor,username:'cabralorenzo'}]);
  expect(p.mediaKeys).toHaveLength(2);
  expect(p.inserts.logo_media[0].url).toContain('rehearsal.example');
  expect(Object.keys(p.inserts)).not.toContain('posts');
 });
 it('excludes the exact test website and its creator without excluding other websites',()=>{
  const {s,d}=make();s.rows.websites=[{id:EXCLUDED_WEBSITE_ID,creator_id:'unrelated',slug:'test'}];
  expect(buildReleaseContentPlan(s,d,options).inserts.websites).toEqual([]);
 });
 it('stops on account ownership, slug collisions, unknown duplicate identity and missing media',()=>{
  for(const mutate of [(s:ContentSnapshot)=>{s.rows.creators[0].has_owner=true;},(_s:ContentSnapshot,d:ContentSnapshot)=>{d.rows.logos.push({id:'collision',slug:'auric'});},(s:ContentSnapshot,d:ContentSnapshot)=>{s.rows.creators[1].url='https://x.com/same';d.rows.creators.push({...profile('different',null),url:'https://x.com/same'});},(s:ContentSnapshot)=>{s.rows.logo_media=[];}]){
   const {s,d}=make();mutate(s,d);expect(()=>buildReleaseContentPlan(s,d,options)).toThrow(/Release content/);
  }
 });
 it('is a zero-change rerun and rejects changed existing work instead of overwriting it',()=>{
  const {s,d}=make(),p=buildReleaseContentPlan(s,d,options);
  for(const [table,rows] of Object.entries(p.inserts))d.rows[table].push(...rows);
  d.rows.creators[0].username='cabralorenzo';
  const again=buildReleaseContentPlan(s,d,options);
  expect(Object.values(again.inserts).flat()).toEqual([]);expect(again.profileUpdates).toEqual([]);
  d.rows.logos[0].slug='changed';expect(()=>buildReleaseContentPlan(s,d,options)).toThrow(/Release content/);
 });
});
