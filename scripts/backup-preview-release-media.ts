import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawn } from 'node:child_process';
import { Pool } from "@neondatabase/serverless";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { loadPreviewEnvironment } from "./lib/preview-environment";
import { assertSnapshotUnchanged, captureContentSnapshot } from "./lib/content-transfer-database";
import type { ContentSnapshot } from "./lib/content-transfer-plan";
import { assertSponsorBackupCoverage, backupSha256, captureReleaseMedia, PREVIEW_MEDIA_BUCKETS, releaseSnapshotLabel, retryBackupObjectRead, storePreviewMedia, type BackupObject, type MediaObject, type SponsorBackupReference } from "./lib/release-backup-media";
import { assertSponsorBackupTables, readSponsorBackupReferences } from "./lib/sponsor-backup-references";
import {canonicalHash} from './lib/content-transfer-plan';
import {captureReleaseDatabase,assertReleaseDatabaseSame,releaseDumpSequences,withReleaseCaptureSnapshot} from './lib/release-capture-snapshot';
let stage='arguments',diagnosticPath:string|undefined;

async function dumpSnapshot(url:string,id:string,file:string,signal:AbortSignal){
 const u=new URL(url),env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 Object.assign(env,{PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGOPTIONS:'-c default_transaction_read_only=on'});
 const tool=resolve('.scratch/release-preparation/tools/postgresql18/pgsql/bin/pg_dump.exe');
 await new Promise<void>((ok,fail)=>{const child=spawn(tool,['--format=custom','--no-owner','--no-privileges','--snapshot='+id,'--file='+file],{env,windowsHide:true,signal,stdio:['ignore','ignore','pipe']});child.stderr.resume();child.once('error',()=>fail(Error('Backup dump interrupted or could not start')));child.once('close',code=>code===0?ok():fail(Error('Backup dump failed')));});
 const restore=async(args:string[])=>new Promise<string>((ok,fail)=>{let out='';const child=spawn(resolve('.scratch/release-preparation/tools/postgresql18/pgsql/bin/pg_restore.exe'),args,{env,windowsHide:true,signal,stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>{out+=String(c);if(out.length>1024*1024)child.kill();});child.stderr.resume();child.once('error',()=>fail(Error('Backup sequence decode interrupted')));child.once('close',code=>code===0?ok(out):fail(Error('Backup sequence decode failed')));});
 const toc=await restore(['--list',file]),list=toc.split(/\r?\n/).filter(line=>/ SEQUENCE SET /.test(line)).join('\n')+'\n';
 const listFile=file+'.sequences.list';writeFileSync(listFile,list,{flag:'wx'});
 const sequenceSql=await restore(['--data-only','--use-list='+listFile,'--file=-',file]);writeFileSync(file+'.sequences.sql',sequenceSql,{flag:'wx'});
 return {archiveSha256:backupSha256(readFileSync(file)),sequenceSql,sequenceSqlSha256:backupSha256(Buffer.from(sequenceSql))};
}

function editorialReferences(snapshot:ContentSnapshot,publicBase:string):SponsorBackupReference[]{
 const prefix=publicBase.replace(/\/$/,'')+'/',keys=new Set<string>();
 const visit=(value:unknown):void=>{if(typeof value==='string'&&value.startsWith(prefix)){const u=new URL(value);const key=decodeURIComponent(u.pathname.slice(1));if(u.search||u.hash||!key||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Backup editorial reference rejected');keys.add(key);}else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
 visit(snapshot.rows);return [...keys].sort().map(key=>({bucket:PREVIEW_MEDIA_BUCKETS[0],key,required:true}));
}

async function main() {
  const [selector, mode, ...extra] = process.argv.slice(2), label = releaseSnapshotLabel(selector ?? "");
  if (extra.length || !["paths", "capture", "snapshot-paths", "capture-snapshot"].includes(mode)) throw Error("Backup mode rejected");
  const root = realpathSync(".scratch/release-preparation");
  const receipt = resolve(root, "preview-media-backup-" + label + ".json");
  const archivePath=resolve(root,'private-recovery/preview-'+label+'.dump'),dbCapturePath=resolve(root,'private-recovery/preview-'+label+'-capture.json');
  if (mode === "paths"||mode==='snapshot-paths') { console.log(JSON.stringify({ networkRequests: 0, receipt,...(mode==='snapshot-paths'?{archive:archivePath,capture:dbCapturePath,protocol:'exported-snapshot-v1'}:{}) })); return; }
  if (existsSync(receipt)) throw Error("Backup completed receipt exists; choose unused snapshot");
  const physicalPrivate=realpathSync(resolve(root,'private-recovery'));
  if(!physicalPrivate.startsWith(root+sep))throw Error('Backup recovery directory redirected');
  diagnosticPath=resolve(physicalPrivate,'preview-'+label+'-failure.json');
  const local = (p: string) => {
    const target = realpathSync(resolve(root, p));
    if (!target.startsWith(root + sep) || /(^|[\\/])\.env(?:[.\\/]|$)/i.test(target)) throw Error("Backup local path rejected");
    return target;
  };
  const capturePath = "private-recovery/preview-" + label + "-capture.json";
  const consistent=mode==='capture-snapshot';
  let rawCapture:Buffer,capture:{kind:string;archiveSha256:string;snapshot:ContentSnapshot};
  if(consistent){
    if(realpathSync(resolve(root,'private-recovery'))!==resolve(root,'private-recovery'))throw Error('Backup recovery directory redirected');
    if(existsSync(archivePath)||existsSync(dbCapturePath))throw Error('Backup immutable database name already exists');
    writeFileSync(receipt+'.started.json',JSON.stringify({at:new Date().toISOString(),label,protocol:'exported-snapshot-v1',readOnly:true})+'\n',{flag:'wx'});
    writeFileSync(archivePath,Buffer.alloc(0),{flag:'wx'});
    writeFileSync(receipt+'.objects.ndjson','',{flag:'wx'});
  }else{
    rawCapture=readFileSync(local(capturePath));capture=JSON.parse(rawCapture.toString());
    if(capture.kind!=='preview'||backupSha256(readFileSync(local('private-recovery/preview-'+label+'.dump')))!==capture.archiveSha256)throw Error('Backup matching preview database archive required');
    assertSponsorBackupTables(Object.keys(capture.snapshot.tableHashes));
  }
  const e = loadPreviewEnvironment();
  if (e.r2BucketName !== PREVIEW_MEDIA_BUCKETS[0] || e.r2SubmissionsBucketName !== PREVIEW_MEDIA_BUCKETS[1]) throw Error("Backup preview bucket identity rejected");
  const pool = new Pool({ connectionString: e.databaseUrlUnpooled, connectionTimeoutMillis: 20000 });
  const client = new S3Client({ region: "auto", endpoint: `https://${e.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.r2AccessKeyId, secretAccessKey: e.r2SecretAccessKey }, maxAttempts: 2 });
  const cache = new Map<string, BackupObject>();
  // Reuse only digest-checked local bytes with an unchanged current source ETag.
  for (const name of ["phase3-production-media-backup.json", "phase3-production-media-backup-20261001.json"]) {
    if (!existsSync(resolve(root, name))) continue;
    const prior = JSON.parse(readFileSync(local(name), "utf8"));
    for (const o of prior.objects as BackupObject[]) if (o.bucket === "inspora-media-production" && /^private-recovery\/production-media-full\/[a-f0-9]{64}$/.test(o.localPath)) cache.set(PREVIEW_MEDIA_BUCKETS[0]+'/'+o.key, o);
  }
  // Rejected attempts are never accepted backups. Their verified per-object journal
  // may supply bytes only after digest/size verification and a current IfMatch HEAD.
  for(const name of readdirSync(root).filter(name=>/^preview-media-backup-\d{8}T\d{6}Z\.json\.objects\.ndjson$/.test(name))){
    for(const line of readFileSync(local(name),'utf8').split('\n').filter(Boolean)){
      const o=JSON.parse(line) as BackupObject;
      if(PREVIEW_MEDIA_BUCKETS.includes(o.bucket)&&o.localPath==='private-recovery/preview-media-full/'+o.sha256&&/^[a-f0-9]{64}$/.test(o.sha256))cache.set(o.bucket+'/'+o.key,o);
    }
  }
  const started = Date.now();
  let sponsorReferences: SponsorBackupReference[] = [];
  let references:SponsorBackupReference[]=[];
  let lists=0,captures=0,completed=0;
  try {
    const media=async(checkSnapshot:()=>Promise<void>,signal?:AbortSignal)=>captureReleaseMedia({
      buckets: [...PREVIEW_MEDIA_BUCKETS],
      checkSnapshot,
      list: async () => {
        stage=lists===0?'media-inventory-before':'media-inventory-after';
        const result: MediaObject[] = [];
        for (const bucket of PREVIEW_MEDIA_BUCKETS) {
          let token: string | undefined;
          do {
            const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }), { abortSignal: signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000) });
            for (const o of page.Contents ?? []) {
              if (!o.Key || !o.ETag || o.Size === undefined) throw Error("Backup incomplete provider inventory");
              result.push({ bucket, key: o.Key, etag: o.ETag, size: o.Size, lastModified: o.LastModified?.toISOString() });
            }
            token = page.NextContinuationToken;
            if (page.IsTruncated && !token) throw Error("Backup incomplete provider pagination");
          } while (token);
        }
        if(consistent){writeFileSync(archivePath+(++lists===1?'.inventory-before.json':'.inventory-after.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});assertSponsorBackupCoverage([...sponsorReferences,...references],result);}
        stage='media-transfer';return result;
      },
      cached: async o => {
        const c = cache.get(o.bucket+'/'+o.key);
        if (!c || c.etag !== o.etag || c.size !== o.size || !existsSync(resolve(root, c.localPath))) return;
        return { bytes: readFileSync(local(c.localPath)), sha256: c.sha256 };
      },
      head: async o => {
        const h = await client.send(new HeadObjectCommand({ Bucket: o.bucket, Key: o.key, IfMatch: o.etag }), { abortSignal: signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000) });
        if (h.ContentLength !== o.size || h.ETag !== o.etag) throw Error("Backup cached source version changed");
        return { etag: h.ETag, contentType: h.ContentType, cacheControl: h.CacheControl, contentDisposition: h.ContentDisposition, contentEncoding: h.ContentEncoding, contentLanguage: h.ContentLanguage, metadata: h.Metadata };
      },
      get: async o => retryBackupObjectRead(async()=>{
        const r = await client.send(new GetObjectCommand({ Bucket: o.bucket, Key: o.key, IfMatch: o.etag }), { abortSignal: signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000) });
        if (!r.Body || r.ContentLength !== o.size || !r.ETag) throw Error("Backup object response rejected");
        return { bytes: await r.Body.transformToByteArray(), etag: r.ETag, contentType: r.ContentType, cacheControl: r.CacheControl, contentDisposition: r.ContentDisposition, contentEncoding: r.ContentEncoding, contentLanguage: r.ContentLanguage, metadata: r.Metadata };
      },signal),
      store: async (digest, bytes) => {if(signal?.aborted)throw Error('Backup media aborted');return storePreviewMedia(root, digest, bytes);},
      record:consistent?async object=>{appendFileSync(receipt+'.objects.ndjson',JSON.stringify(object)+'\n');if(++completed%250===0)console.log(JSON.stringify({stage:'media-progress',completed,label,readOnly:true}));}:undefined,
    });
    let report:Awaited<ReturnType<typeof media>>,protocol:Record<string,unknown>={};
    if(consistent){
      const db=await pool.connect();let closed=false;
      const result=await withReleaseCaptureSnapshot({deadlineMs:15*60*1000,query:sql=>db.query(sql),capture:async()=>{stage='database-snapshot-check';const state=await captureReleaseDatabase(db,'preview');if(captures++===0)writeFileSync(archivePath+'.snapshot-before.json',JSON.stringify({acceptedBackup:false,...state},null,2)+'\n',{flag:'wx'});return state;},assertSame:assertReleaseDatabaseSame,
        dump:async(id,signal)=>{stage='snapshot-dump';console.log(JSON.stringify({stage,label,readOnly:true}));return dumpSnapshot(e.databaseUrlUnpooled,id,archivePath,signal);},
        media:async(before,check,signal)=>{assertSponsorBackupTables(Object.keys(before.snapshot.tableHashes));sponsorReferences=await readSponsorBackupReferences(db);references=editorialReferences(before.snapshot,e.r2PublicBaseUrl);console.log(JSON.stringify({stage:'public-private-media',label,editorialReferences:references.length,sponsorReferences:sponsorReferences.length,readOnly:true}));const report=await media(check,signal);assertSponsorBackupCoverage([...sponsorReferences,...references],report.objects);return report;},
        close:async destroy=>{if(closed)return;closed=true;if(destroy)db.release(true);else{try{await db.query('ROLLBACK');}finally{db.release(true);}}},
        live:async signal=>{stage='live-observation';const live=await pool.connect();let released=false;const cancel=()=>{if(!released){released=true;live.release(true);}};signal.addEventListener('abort',cancel,{once:true});try{if(signal.aborted)throw Error('Backup live observation aborted');await live.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='45s'");const state=await captureReleaseDatabase(live,'preview');await live.query('ROLLBACK');return {capturedAt:state.snapshot.capturedAt,tableHashes:state.snapshot.tableHashes,schemaSha256:canonicalHash(state.snapshot.schema),sequences:state.sequences};}finally{signal.removeEventListener('abort',cancel);cancel();}},
      });
      const dbReceipt={capturedAt:result.before.snapshot.capturedAt,kind:'preview',endpointSha256:backupSha256(Buffer.from(new URL(e.databaseUrlUnpooled).hostname)),archiveSha256:result.dump.archiveSha256,protocol:result.protocol,pointInTimeOnly:true,...result.before,sequences:releaseDumpSequences(result.before.sequences,result.dump.sequenceSql),sequenceSamples:{beforeDump:result.before.sequences,afterCapture:result.live.sequences},sequenceSqlSha256:result.dump.sequenceSqlSha256};
      rawCapture=Buffer.from(JSON.stringify(dbReceipt,null,2)+'\n');writeFileSync(dbCapturePath,rawCapture,{flag:'wx'});capture=dbReceipt;report=result.media;
      const changedTables=Object.keys(result.live.tableHashes).filter(table=>canonicalHash(result.before.snapshot.tableHashes[table])!==canonicalHash(result.live.tableHashes[table]));
      protocol={protocol:result.protocol,pointInTimeOnly:true,liveAfterCapture:result.live,changedTablesSinceT:changedTables,sequencePositionsAreNotMVCC:true,editorialReferencesVerified:references.length};
    }else{
      report=await media(async()=>{
        const db = await pool.connect();
        try {
          await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
          assertSnapshotUnchanged(capture!.snapshot, await captureContentSnapshot(db, "preview"));
          sponsorReferences = await readSponsorBackupReferences(db);
          await db.query("COMMIT");
        } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
      });
    }
    assertSponsorBackupCoverage(sponsorReferences, report.objects);
    const result = { at: new Date().toISOString(), label, previewCaptureSha256: backupSha256(rawCapture!), seconds: (Date.now() - started) / 1000, sponsorshipReferencesVerified: true, sponsorReferences: sponsorReferences.length, ...report,...protocol };
    writeFileSync(receipt, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...result, objects: undefined,liveAfterCapture:undefined }));
  } finally { client.destroy(); await pool.end(); }
}
main().catch(error => {
  const safe = error instanceof Error && /^(Backup [a-zA-Z /;.,:-]+|Transfer database assertion: snapshot drift in [a-zA-Z_]+\.|Connection terminated unexpectedly|Connection terminated due to connection timeout)$/.test(error.message) ? error.message : "Backup preview media capture stopped; credentials suppressed";
  if(diagnosticPath&&!existsSync(diagnosticPath))writeFileSync(diagnosticPath,JSON.stringify({at:new Date().toISOString(),acceptedBackup:false,stage,message:safe,code:typeof error?.code==='string'&&/^[A-Z0-9_-]{1,32}$/.test(error.code)?error.code:null,httpStatus:error?.$metadata?.httpStatusCode??null},null,2)+'\n',{flag:'wx'});
  console.error(safe + ". Preserve local bytes and investigate drift before retry."); process.exitCode = 1;
});
