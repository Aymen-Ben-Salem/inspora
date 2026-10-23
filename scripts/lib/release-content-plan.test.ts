import {describe,it,expect} from 'vitest';
import {buildReleaseContentPlan} from './release-content-plan';
import {D1,EXCLUDED_WEBSITE_ID,type ContentSnapshot} from './content-transfer-plan';
const empty=():ContentSnapshot=>({capturedAt:'',rows:{creators:[],creator_username_aliases:[],logos:[],logo_media:[],websites:[],website_media:[],website_sections:[]},tableHashes:{},schema:[],ledger:[],constraints:[],indexes:[]});
const profile=(id:string,username:string|null)=>({id,name:id,handle:null,username,has_owner:false,has_verified_x:false,record_origin:'mirrored'});
const make=()=>{const s=empty(),d=empty();s.rows.creators=[profile(D1.survivor,'cabralorenzo'),profile('new','new_name'),profile('unrelated','unused')];d.rows.creators=[profile(D1.survivor,null)];s.rows.logos=[{id:D1.auric,slug:'auric',kind:'logo',creator_id:D1.survivor},{id:'logo2',slug:'new-logo',kind:'icon',creator_id:'new'}];s.rows.logo_media=s.rows.logos.map(l=>({id:'m'+l.id,logo_id:l.id,url:'https://preview.example/'+l.id,storage_key:l.id}));s.rows.creator_username_aliases=s.rows.creators.map(c=>({id:'a'+c.id,creator_id:c.id,username:c.username,is_current:true}));return{s,d};};
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
 it('includes websites with recording media and no sections',()=>{
  const {s,d}=make();
  s.rows.websites=[{id:'website',creator_id:'new',slug:'website',technologies:['Next.js'],is_featured:true,status:'published',published_at:'2026-10-22',created_at:'2026-10-21'}];
  s.rows.website_media=[{id:'recording',website_id:'website',role:'recording',url:'https://preview.example/websites/recording.mp4',storage_key:'websites/recording.mp4',poster_url:'https://preview.example/poster.webp',poster_storage_key:'poster.webp',video_preview:{url:'https://preview.example/preview.mp4',storageKey:'preview.mp4'}},{id:'favicon',website_id:'website',role:'favicon',url:'https://preview.example/icon.webp',storage_key:'icon.webp'}];
  const plan=buildReleaseContentPlan(s,d,options);
  expect(plan.inserts.websites).toHaveLength(1);
  expect(plan.inserts.website_media[0].url).toBe('https://rehearsal.example/websites/recording.mp4');
  expect(plan.inserts.website_sections).toEqual([]);
  expect(plan.inserts.websites[0]).toEqual(s.rows.websites[0]);
  expect(plan.mediaKeys).toEqual(expect.arrayContaining(['poster.webp','preview.mp4','icon.webp']));
  expect(plan.inserts.logos.map(r=>r.kind)).toEqual(['logo','icon']);
  const legacy=structuredClone(s);legacy.rows.website_media[1].storage_key=null;legacy.rows.website_media[1].storage_provider=null;
  const legacyPlan=buildReleaseContentPlan(legacy,d,options);expect(legacyPlan.mediaKeys).toContain('icon.webp');expect(legacyPlan.inserts.website_media[1].storage_key).toBeNull();
  legacy.rows.website_media[1].url='https://preview.example/icon.webp?unreviewed=true';expect(()=>buildReleaseContentPlan(legacy,d,options)).toThrow(/mismatch/);
  for(const field of ['poster_url','video_preview']){const changed=structuredClone(s);delete changed.rows.website_media[0][field];expect(()=>buildReleaseContentPlan(changed,d,options)).toThrow(/presentation/);}
  const changed=structuredClone(s);changed.rows.website_media.pop();expect(()=>buildReleaseContentPlan(changed,d,options)).toThrow(/presentation/);
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
