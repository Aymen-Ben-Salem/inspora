import {describe,it,expect,vi} from 'vitest';
import {releaseDumpSequences,withReleaseCaptureSnapshot} from './release-capture-snapshot';

function fixture(){
 const log:string[]=[];let signal:AbortSignal|undefined;
 const io={deadlineMs:1000,query:vi.fn(async(sql:string)=>{log.push(sql);return {rows:sql.includes('pg_export_snapshot')?[{snapshot:'000001-000002-1'}]:[]};}),
 capture:vi.fn(async()=>({hash:'at-T'})),assertSame:(a:unknown,b:unknown)=>expect(b).toEqual(a),
 dump:vi.fn(async(id:string,s:AbortSignal)=>{signal=s;log.push('dump:'+id);return 'dump-digest';}),
 media:vi.fn(async(_before:unknown,check:()=>Promise<void>)=>{log.push('media');await check();return 'media-digest';}),
 close:vi.fn(async(destroy:boolean)=>{log.push('close:'+destroy);}),live:vi.fn(async()=>{log.push('live');return {laterEvents:2};})};
 return {io,log,signal:()=>signal};
}
describe('exported snapshot capture',()=>{
 it('passes the exported snapshot to the dump, checks through media, then closes before reporting later writes',async()=>{
  const f=fixture();const r=await withReleaseCaptureSnapshot(f.io);
  expect(r).toMatchObject({protocol:'exported-snapshot-v1',pointInTimeOnly:true,before:{hash:'at-T'},live:{laterEvents:2}});
  expect(f.log.indexOf('dump:000001-000002-1')).toBeLessThan(f.log.indexOf('media'));
  expect(f.log.slice(-2)).toEqual(['close:false','live']);expect(f.io.capture).toHaveBeenCalledTimes(4);expect(f.signal()?.aborted).toBe(true);
 });
 it('rejects drift/errors without producing success or live evidence and closes the session',async()=>{
  for(const stage of ['dump','media','capture'] as const){const f=fixture();f.io[stage].mockRejectedValueOnce(Error(stage+' failed'));await expect(withReleaseCaptureSnapshot(f.io)).rejects.toThrow(stage+' failed');expect(f.io.close).toHaveBeenCalledWith(true);expect(f.io.live).not.toHaveBeenCalled();}
 });
 it('aborts a stalled dump at the deadline and destroys its transaction',async()=>{
  vi.useFakeTimers();try{const f=fixture();f.io.dump.mockImplementation(async(_id,s)=>{return await new Promise<string>((_,reject)=>s.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));});const result=withReleaseCaptureSnapshot(f.io);const assertion=expect(result).rejects.toThrow(/expired|aborted/);await vi.advanceTimersByTimeAsync(1001);await assertion;expect(f.io.close).toHaveBeenCalledWith(true);expect(f.io.media).not.toHaveBeenCalled();expect(f.signal()).toBeUndefined();}finally{vi.useRealTimers();}
 });
 it('rejects invalid bounds and malformed exported snapshots before dumping',async()=>{
  const f=fixture();await expect(withReleaseCaptureSnapshot({...f.io,deadlineMs:900001})).rejects.toThrow(/deadline/);expect(f.io.query).not.toHaveBeenCalled();
  f.io.query.mockResolvedValue({rows:[{snapshot:"unsafe' snapshot"}]});await expect(withReleaseCaptureSnapshot(f.io)).rejects.toThrow(/snapshot rejected/);expect(f.io.dump).not.toHaveBeenCalled();expect(f.io.close).toHaveBeenCalled();
 });
 it('keeps a long snapshot active and fails closed when its heartbeat disconnects',async()=>{
  vi.useFakeTimers();try{
   const f=fixture();f.io.deadlineMs=30000;
   f.io.query.mockImplementation(async sql=>{if(sql==='select 1')throw Error('connection lost');return {rows:sql.includes('pg_export_snapshot')?[{snapshot:'000001-000002-1'}]:[]};});
   f.io.dump.mockImplementation(async(_id,s)=>await new Promise<string>((_,reject)=>s.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
   const result=withReleaseCaptureSnapshot(f.io);const assertion=expect(result).rejects.toThrow(/connection lost|aborted/);await vi.advanceTimersByTimeAsync(15001);await assertion;
   expect(f.io.query).toHaveBeenCalledWith('select 1');expect(f.io.close).toHaveBeenCalledWith(true);expect(f.io.live).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
});

describe('dump sequence evidence',()=>{
 const definitions=[{schemaname:'public',sequencename:'event_id_seq',last_value:'1'},{schemaname:'drizzle',sequencename:'migration_id_seq',last_value:null}];
 const sql="SELECT pg_catalog.setval('public.event_id_seq', 3, true);\nSELECT pg_catalog.setval('drizzle.migration_id_seq', 1, false);";
 it('uses actual archive counters, preserving uncalled sequences and exact bigint precision',()=>{
  expect(releaseDumpSequences(definitions,sql)).toEqual([{...definitions[0],last_value:'3'},definitions[1]]);
  expect(releaseDumpSequences([definitions[0]],sql.split('\n')[0].replace(', 3,',', 9007199254740993,'))[0].last_value).toBe('9007199254740993');
 });
 it('rejects missing, duplicated or unrelated sequence evidence',()=>{
  for(const invalid of [sql.split('\n')[0],sql+'\n'+sql,sql.replace('event_id_seq','wrong_seq')])expect(()=>releaseDumpSequences(definitions,invalid)).toThrow(/sequence/);
 });
});
