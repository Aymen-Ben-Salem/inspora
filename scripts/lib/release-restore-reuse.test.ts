import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from './content-transfer-plan';
import { RESTORE_REUSE_TARGET, guardRestoreReuse, reuseRestoreTarget, type RestoreReusePlan } from './release-restore-reuse';
const now = Date.parse('2026-10-22T20:00:00Z');
const plan = (): RestoreReusePlan => ({ version:1, target: {...RESTORE_REUSE_TARGET}, beforeSha256:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),consumers:{reviewedAt:'2026-10-22T19:55:00Z',expiresAt:'2026-10-22T20:10:00Z',bindingsComplete:true,consumers:[]},retainedCopy:{archiveSha256:'c'.repeat(64),verifiedDownloadSha256:'c'.repeat(64),independentlyRestored:true} });
const url='postgresql://neondb_owner:fixture@ep-raspy-morning-aszy572t.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require';
describe('existing isolated restore target',()=>{
 it('requires exact target, current consumer clearance, retained proof and explicit plan authorization',()=>{
  const p=plan(),auth='RESET-ISOLATED-DATABASE:'+canonicalHash(p);expect(()=>guardRestoreReuse(url,p,now,auth)).not.toThrow();
  for(const mutate of [(p:RestoreReusePlan)=>{p.target.database='phase3_production_restore'},(p:RestoreReusePlan)=>{p.consumers.bindingsComplete=false},(p:RestoreReusePlan)=>{p.consumers.consumers=['historical alias']},(p:RestoreReusePlan)=>{p.retainedCopy.independentlyRestored=false},(p:RestoreReusePlan)=>{p.consumers.expiresAt='2026-10-22T19:59:00Z'}]){const p=plan();mutate(p);expect(()=>guardRestoreReuse(url,p,now,'RESET-ISOLATED-DATABASE:'+canonicalHash(p))).toThrow();}
  expect(()=>guardRestoreReuse(url,plan(),now)).toThrow(/authorization/);
  for(const unsafe of [url.replace('/neondb?','/phase3_production_restore?'),url.replace('ep-raspy-morning-aszy572t','ep-plain-glade-aswp1anv'),url.replace('ep-raspy-morning-aszy572t','ep-wandering-morning-as7pv0j5'),url.replace('.c-4','-pooler.c-4')])expect(()=>guardRestoreReuse(unsafe,p,now,auth)).toThrow(/target/);
 });
 const fixture=()=>({guard:vi.fn(),archiveSha256:async()=>'archive',beforeSha256:async()=>'before',expectedArchiveSha256:'archive',expectedBeforeSha256:'before',activeConsumers:async()=>0,resetPublicAndDrizzle:vi.fn(async()=>{}),isEmpty:async()=>true,restore:vi.fn(async()=>{}),verify:async()=>true});
 it('reuses one existing database sequentially without creation',async()=>{const io=fixture();expect(await reuseRestoreTarget(io)).toMatchObject({databaseCreated:false,verified:true});expect(io.resetPublicAndDrizzle).toHaveBeenCalledOnce();expect(io.restore).toHaveBeenCalledOnce();});
 it('stops before reset on drift or active consumers',async()=>{for(const change of [{beforeSha256:async()=>'drift'},{archiveSha256:async()=>'drift'},{activeConsumers:async()=>1}]){const io={...fixture(),...change};await expect(reuseRestoreTarget(io)).rejects.toThrow();expect(io.resetPublicAndDrizzle).not.toHaveBeenCalled();}});
 it('stops on reset, empty check, restore and verification errors',async()=>{for(const change of [{resetPublicAndDrizzle:async()=>{throw Error('reset failed')}},{isEmpty:async()=>false}]){const io={...fixture(),...change};await expect(reuseRestoreTarget(io)).rejects.toThrow();expect(io.restore).not.toHaveBeenCalled();}const io={...fixture(),restore:vi.fn(async()=>{throw Error('pg_restore failed')})};await expect(reuseRestoreTarget(io)).rejects.toThrow('pg_restore failed');await expect(reuseRestoreTarget({...fixture(),verify:async()=>false})).rejects.toThrow(/verification/);});
});
