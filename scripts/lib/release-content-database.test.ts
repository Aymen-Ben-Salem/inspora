import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {PoolClient} from '@neondatabase/serverless';
import type {ContentSnapshot} from './content-transfer-plan';
import {captureContentSnapshot} from './content-transfer-database';
import {initializeCreatorProfiles} from './creator-profile-backfill-database';
import {applyReleaseContent} from './release-content-database';
vi.mock('./content-transfer-database',async original=>({...await original<object>(),captureContentSnapshot:vi.fn()}));
vi.mock('./creator-profile-backfill-database',()=>({initializeCreatorProfiles:vi.fn()}));
function fixture(){
 const creators=[{id:'a',name:'Alex Socoloff',handle:'@socoloffalex',username:'socoloffalex',record_origin:'mirrored',url:'https://x.com/alex_barashkov'},{id:'b',name:'Alex Barashkov',handle:'@alex_barashkov',username:'alex_barashkov',record_origin:'mirrored'}];
 const aliases=creators.map(c=>({id:'alias'+c.id,creator_id:c.id,username:c.username,is_current:true}));
 const rows={creators,creator_username_aliases:aliases,posts:[{id:'mixed',title:'Handmade icons',creator_id:'a'},{id:'character',creator_id:'a'}],logos:[],logo_media:[],websites:[],website_media:[],website_sections:[]};
 const before:ContentSnapshot={capturedAt:'',rows,tableHashes:{creators:{count:2,sha256:'c'},posts:{count:2,sha256:'p'},sponsor_accounts:{count:1,sha256:'protected'},analytics_events:{count:1,sha256:'protected'}},schema:[],ledger:[],constraints:[],indexes:[]};
 const plan={inserts:{creators:[],creator_username_aliases:[],logos:[],logo_media:[],websites:[],website_media:[],website_sections:[]},profileUpdates:[],mediaKeys:[],selectedCreatorIds:['b'],selectedWorkIds:[],reviewedUpdates:[{table:'posts' as const,id:'mixed',before:{creator_id:'a'},values:{creator_id:'b'}}]};
 const after=structuredClone(before);after.rows.posts[0].creator_id='b';after.tableHashes.posts.sha256='new';
 const query=vi.fn(async(sql:string)=>({rows:[],rowCount:sql.startsWith('update')?1:0}));
 return {before,after,plan,query,client:{query} as unknown as PoolClient};
}
beforeEach(()=>{vi.mocked(captureContentSnapshot).mockReset();vi.mocked(initializeCreatorProfiles).mockResolvedValue({inspected:2,changes:[]});});
describe('reviewed release update execution',()=>{
 it('executes the exact attribution correction, audits it and preserves other work, billing and analytics',async()=>{const f=fixture();vi.mocked(captureContentSnapshot).mockResolvedValueOnce(f.before).mockResolvedValueOnce(f.after);await applyReleaseContent(f.client,f.before,f.plan,'rehearsal');expect(f.query.mock.calls.filter(([s])=>s.startsWith('update'))).toEqual([['update public."posts" set "creator_id"=$2 where id=$1',['mixed','b']]]);expect(f.query.mock.calls.some(([s])=>s.includes('release.corrected'))).toBe(true);expect(f.query.mock.calls.some(([s])=>s==='COMMIT')).toBe(true);});
 it('rolls back if unrelated protected rows or another existing work changed',async()=>{for(const corrupt of [(f:ReturnType<typeof fixture>)=>{f.after.tableHashes.sponsor_accounts.sha256='changed'},(f:ReturnType<typeof fixture>)=>{f.after.rows.posts[1].creator_id='b'}]){const f=fixture();corrupt(f);vi.mocked(captureContentSnapshot).mockReset().mockResolvedValueOnce(f.before).mockResolvedValueOnce(f.after);await expect(applyReleaseContent(f.client,f.before,f.plan,'rehearsal')).rejects.toThrow(/unrelated|protected/);expect(f.query.mock.calls.some(([s])=>s==='ROLLBACK')).toBe(true);}});
 it('rolls back before update if the reviewed before-state differs',async()=>{const f=fixture();f.plan.reviewedUpdates[0].before.creator_id='other';vi.mocked(captureContentSnapshot).mockResolvedValue(f.before);await expect(applyReleaseContent(f.client,f.before,f.plan,'rehearsal')).rejects.toThrow(/before-state/);expect(f.query.mock.calls.some(([s])=>s.startsWith('update'))).toBe(false);});
});
