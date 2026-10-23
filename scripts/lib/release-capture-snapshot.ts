import {assertSnapshotUnchanged, captureContentSnapshot, type TransferDatabaseClient} from './content-transfer-database';
import {canonicalHash} from './content-transfer-plan';
import type {Row} from './content-transfer-plan';

/** Rows/schema are MVCC evidence. Sequence positions are sampled separately: they are not MVCC. */
export async function captureReleaseDatabase(client:TransferDatabaseClient, environment:'source'|'preview'){
 const snapshot=await captureContentSnapshot(client,environment);
 if(environment==='source')for(const {tablename} of (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows){
  const quoted='"'+String(tablename).replaceAll('"','""')+'"';
  snapshot.tableHashes[String(tablename)]=(await client.query(`select count(*)::int as count, encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.${quoted} t`)).rows[0] as {count:number;sha256:string};
 }
 const extensions=(await client.query('select extname,extversion from pg_extension order by extname')).rows;
 const sequences=(await client.query("select schemaname,sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname in ('public','drizzle') order by schemaname,sequencename")).rows;
 return {snapshot,extensions,sequences};
}

/** The caller owns one dedicated read-only session and must destroy it when close(true) is called. */
export async function withReleaseCaptureSnapshot<S,D,M,L>(io:{
 deadlineMs:number;query(sql:string):Promise<{rows:Record<string,unknown>[]}>,capture():Promise<S>;
 assertSame(before:S,after:S):void;
 dump(snapshotId:string,signal:AbortSignal):Promise<D>;
 media(before:S,checkSnapshot:()=>Promise<void>,signal:AbortSignal):Promise<M>;
 close(destroy:boolean):Promise<void>;live(signal:AbortSignal):Promise<L>;
}){
 if(!Number.isSafeInteger(io.deadlineMs)||io.deadlineMs<1000||io.deadlineMs>15*60*1000)throw Error('Backup snapshot deadline rejected');
 const abort=new AbortController();let closed=false;
 let timer:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined;
 let heartbeatWork:Promise<void>|undefined,heartbeatReject:(e:unknown)=>void=()=>{};
 const heartbeatFailure=new Promise<never>((_,reject)=>{heartbeatReject=reject;});
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Backup snapshot deadline expired'));},io.deadlineMs);});
 const bounded=<T>(work:Promise<T>)=>Promise.race([work,timeout,heartbeatFailure]);
 try{
  await bounded(io.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  await bounded(io.query(`SET LOCAL statement_timeout='45s'; SET LOCAL idle_in_transaction_session_timeout='${io.deadlineMs}ms'; SET LOCAL lock_timeout='5s'`));
  const rows=(await bounded(io.query('select pg_export_snapshot() as snapshot'))).rows;
  const id=rows[0]?.snapshot;if(typeof id!=='string'||!/^[0-9A-Fa-f-]+$/.test(id))throw Error('Backup exported snapshot rejected');
  const before=await bounded(io.capture());
  // Keep Neon/proxy connections active while pg_dump and R2 work use this snapshot.
  // A failed heartbeat invalidates the whole capture; never reconnect into a new snapshot.
  heartbeat=setInterval(()=>{if(heartbeatWork)return;heartbeatWork=io.query('select 1').then(()=>{},error=>{abort.abort();heartbeatReject(error);}).finally(()=>{heartbeatWork=undefined;});},15000);
  const check=async()=>{if(abort.signal.aborted)throw Error('Backup snapshot aborted');io.assertSame(before,await bounded(io.capture()));};
  const dump=await bounded(io.dump(id,abort.signal));
  await check();const media=await bounded(io.media(before,check,abort.signal));await check();
  clearInterval(heartbeat);heartbeat=undefined;if(heartbeatWork)await bounded(heartbeatWork);
  await bounded(io.close(false));closed=true;
  const live=await bounded(io.live(abort.signal));
  return {protocol:'exported-snapshot-v1' as const,pointInTimeOnly:true as const,before,dump,media,live};
 }finally{
  if(timer)clearTimeout(timer);if(heartbeat)clearInterval(heartbeat);abort.abort();
  if(!closed)await io.close(true);
 }
}

/** Decode only pg_restore's SEQUENCE SET output; never execute this SQL. */
export function releaseDumpSequences(definitions:Row[],sql:string):Row[]{
 const positions=new Map<string,{value:string;called:boolean}>();
 for(const match of sql.matchAll(/SELECT pg_catalog\.setval\('((?:[^']|'')+)', (-?\d+), (true|false)\);/g)){
  const name=match[1].replaceAll("''","'");const tokens=name.match(/"(?:[^"]|"")*"|[a-z_][a-z_0-9$]*/g);
  if(!tokens||tokens.length!==2||tokens.join('.')!==name)throw Error('Backup sequence identity rejected');
  const key=JSON.stringify(tokens.map(t=>t.startsWith('"')?t.slice(1,-1).replaceAll('""','"'):t));
  if(positions.has(key))throw Error('Backup duplicate dump sequence');
  positions.set(key,{value:match[2],called:match[3]==='true'});
 }
 if(positions.size!==definitions.length)throw Error('Backup dump sequence coverage rejected');
 return definitions.map(row=>{const position=positions.get(JSON.stringify([row.schemaname,row.sequencename]));if(!position)throw Error('Backup dump sequence missing');
  const value=position.called?(typeof row.last_value==='number'?Number(position.value):position.value):null;
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Backup sequence precision rejected');
  return {...row,last_value:value};
 });
}

export function assertReleaseDatabaseSame(before:Awaited<ReturnType<typeof captureReleaseDatabase>>,after:Awaited<ReturnType<typeof captureReleaseDatabase>>){
 assertSnapshotUnchanged(before.snapshot,after.snapshot);
 if(canonicalHash(before.extensions)!==canonicalHash(after.extensions))throw Error('Backup extension snapshot drift');
 const definitions=(value:typeof before)=>value.sequences.map(({last_value:position,...definition})=>{void position;return definition;});
 if(canonicalHash(definitions(before))!==canonicalHash(definitions(after)))throw Error('Backup sequence definition drift');
}
