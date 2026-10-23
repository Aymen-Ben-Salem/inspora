import {describe,it,expect} from 'vitest';
import {canonicalHash,type ContentSnapshot} from './content-transfer-plan';
import {buildReleaseContentPlan} from './release-content-plan';
import {prepareReleaseIdentities,type ReleaseIdentityDecisions} from './release-content-identities';
const snapshot=():ContentSnapshot=>({capturedAt:'',rows:{creators:[],posts:[],logos:[],logo_media:[],websites:[],website_media:[],website_sections:[],creator_username_aliases:[]},tableHashes:{},schema:[],ledger:[],constraints:[],indexes:[]});
function fixture(){
 const s=snapshot(),d=snapshot();
 const c={id:'duplicate',name:'Dmitri',username:'dmitri_2',url:'https://x.com/dmitri',record_origin:'preview',has_owner:false,has_verified_x:false};
 s.rows.creators=[c,{...c,id:'survivor',username:'dmitri'}];d.rows.creators=[{...c,id:'survivor',name:'@dmitri',username:null}];
 s.rows.logos=[{id:'logo',slug:'logo',kind:'icon',creator_id:'duplicate'}];s.rows.logo_media=[{id:'media',logo_id:'logo',url:'https://source.example/logo',storage_key:'logo'}];
 s.rows.creator_username_aliases=[{id:'a1',creator_id:'duplicate',username:'dmitri_2',is_current:true},{id:'a2',creator_id:'survivor',username:'dmitri',is_current:true}];
 const decisions:ReleaseIdentityDecisions={version:1,status:'approved',mappings:[{sourceIds:['duplicate','survivor'],survivorId:'survivor',sourceHashes:Object.fromEntries(s.rows.creators.map(c=>[String(c.id),canonicalHash(c)])),profile:{name:'Dmitri',username:'dmitri',avatar_url:'https://source.example/avatar',avatar_storage_provider:'r2',avatar_storage_key:'avatar'}}],corrections:[]};
 return{s,d,decisions};
}
const origins={sourceHost:'source.example',destinationHost:'target.example'};
describe('reviewed release identities',()=>{
 it('retains survivor IDs, combines credits, reserves aliases, preserves originals and is idempotent',()=>{
  const {s,d,decisions}=fixture(),before=canonicalHash({s,d});const p=buildReleaseContentPlan(s,d,{...origins,decisions});
  expect(p.inserts.creators).toEqual([]);expect(p.inserts.logos[0].creator_id).toBe('survivor');
  expect(p.inserts.creator_username_aliases.map(a=>[a.username,a.creator_id,a.is_current])).toEqual([['dmitri_2','survivor',false],['dmitri','survivor',true]]);
  expect(p.reviewedUpdates[0].values.avatar_url).toBe('https://target.example/avatar');expect(p.mediaKeys).toContain('avatar');expect(canonicalHash({s,d})).toBe(before);
  for(const change of p.reviewedUpdates)Object.assign(d.rows[change.table].find(r=>r.id===change.id)!,change.values);
  for(const [table,rows]of Object.entries(p.inserts))d.rows[table].push(...rows);
  const again=buildReleaseContentPlan(s,d,{...origins,decisions});expect(Object.values(again.inserts).flat()).toEqual([]);expect(again.reviewedUpdates).toEqual([]);
 });
 it('rejects pending decisions, profile drift, ownership and unresolved destination duplicates',()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.decisions.status='pending'},(f:ReturnType<typeof fixture>)=>{f.s.rows.creators[0].name='changed'},(f:ReturnType<typeof fixture>)=>{f.s.rows.creators[0].has_owner=true},(f:ReturnType<typeof fixture>)=>{f.d.rows.creators.push(f.s.rows.creators[0])}]){const f=fixture();change(f);expect(()=>prepareReleaseIdentities(f.s,f.d,f.decisions)).toThrow(/identity/);}
 });
 it('keeps distinct people and corrects only the explicitly reviewed work credit and profile fields',()=>{
  const {s,d}=fixture();d.rows.posts=[{id:'mixed',creator_id:'socoloff',title:'Handmade icons'},{id:'character',creator_id:'socoloff'}];d.rows.creators=[{id:'socoloff',url:'https://x.com/barashkov'},{id:'barashkov',url:'https://x.com/barashkov'}];
  const decisions:ReleaseIdentityDecisions={version:1,status:'approved',mappings:[],corrections:[{table:'posts',id:'mixed',before:{creator_id:'socoloff'},values:{creator_id:'barashkov'}},{table:'creators',id:'socoloff',before:{url:'https://x.com/barashkov'},values:{url:'https://x.com/socoloff'}}]};
  const result=prepareReleaseIdentities(s,d,decisions);expect(result.destination.rows.posts).toEqual([{id:'mixed',creator_id:'barashkov',title:'Handmade icons'},{id:'character',creator_id:'socoloff'}]);expect(result.destination.rows.creators).toHaveLength(2);
  expect(prepareReleaseIdentities(s,result.destination,decisions).updates).toEqual([]);
  decisions.corrections[0].values={title:'replace'};expect(()=>prepareReleaseIdentities(s,d,decisions)).toThrow(/scope/);
 });
 it('reassigns selected-work credit between distinct existing people without deleting either destination identity',()=>{const f=fixture();f.d.rows.creators.push({...f.s.rows.creators[0],url:'https://x.com/other_person'});f.decisions.mappings[0].sourceIds=['duplicate'];f.decisions.mappings[0].kind='attribution';const result=prepareReleaseIdentities(f.s,f.d,f.decisions);expect(result.destination.rows.creators.map(c=>c.id)).toEqual(['survivor','duplicate']);expect(result.source.rows.logos[0].creator_id).toBe('survivor');});
});
