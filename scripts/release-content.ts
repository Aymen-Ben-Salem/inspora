import {RELEASE_CONTENT_CODE_FILES} from "./lib/release-content-code";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from 'dotenv';
import {Pool} from '@neondatabase/serverless';
import {S3Client,GetObjectCommand,HeadObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {loadPreviewEnvironment} from './lib/preview-environment';
import {RELEASE_DATABASE_TARGETS,releaseDatabaseFromValues} from './lib/release-migration';
import {captureContentSnapshot,assertSnapshotUnchanged} from './lib/content-transfer-database';
import {canonicalHash} from './lib/content-transfer-plan';
import {buildReleaseContentPlan} from './lib/release-content-plan';
import {applyReleaseContent,releaseProfilePlan} from './lib/release-content-database';
import {releaseHash} from './lib/release-migration-execution';

async function main(){
 const args=process.argv.slice(2),options:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--target','--plan','--copy','--apply','--rollback-test','--sha256','--confirm-production'].includes(args[i])||options[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Release content arguments rejected');options[args[i]]=args[i+1];}
 const target=options['--target'];if(target!=='rehearsal'&&target!=='production')throw Error('Release content target required');
 const actions=['--plan','--copy','--apply','--rollback-test'].filter(k=>options[k]);if(actions.length!==1)throw Error('Release content choose one action');
 const action=actions[0],path=resolve(options[action]),root=dirname(path),planning=action==='--plan';
 if(!planning&&!options['--sha256'])throw Error('Release content manifest digest required');
 if(!planning&&target==='production'&&options['--confirm-production']!=='AUTHORIZED-PRODUCTION-LAUNCH')throw Error('Release content production writes require explicit launch authorization');
 const env=parse(readFileSync(target==='production'?'.env.production.local':'.env.phase3-rehearsal.local'));
 const databaseUrl=releaseDatabaseFromValues(env,RELEASE_DATABASE_TARGETS[target],process.env);
 const storage=parse(readFileSync(target==='production'?'.env.production.local':'.env.phase3-storage.local'));
 const expectedBucket=target==='production'?'inspora-media-production':'inspora-media-rehearsal-20260929';
 const expectedHost=target==='production'?'media.inspora.design':'pub-7fe6254d6647460f89db9822e4fa619a.r2.dev';
 const publicUrl=new URL(storage.R2_PUBLIC_BASE_URL);
 if(storage.R2_ACCOUNT_ID!=='ff1e7935962337134fef87f5c0dfe27a'||storage.R2_BUCKET_NAME!==expectedBucket||publicUrl.protocol!=='https:'||publicUrl.host!==expectedHost||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash)throw Error('Release content destination storage rejected');
 const preview=loadPreviewEnvironment();
 const sourceClient=new S3Client({region:'auto',endpoint:`https://${preview.r2AccountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:preview.r2AccessKeyId,secretAccessKey:preview.r2SecretAccessKey}});
 const destinationClient=new S3Client({region:'auto',endpoint:`https://${storage.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:storage.R2_ACCESS_KEY_ID,secretAccessKey:storage.R2_SECRET_ACCESS_KEY}});
 const pools=[new Pool({connectionString:preview.databaseUrlUnpooled}),new Pool({connectionString:databaseUrl})];
 const started=Date.now();

 const code={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes:Object.fromEntries(RELEASE_CONTENT_CODE_FILES.map(f=>[f,releaseHash(readFileSync(f))]))};
 const identity={database:RELEASE_DATABASE_TARGETS[target],bucket:expectedBucket,publicHost:expectedHost};
 const capture=async(index:number)=>{const c=await pools[index].connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const s=await captureContentSnapshot(c,'preview');await c.query('COMMIT');return s;}finally{c.release();}};
 const bytes=async(client:S3Client,bucket:string,key:string,etag?:string)=>{const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key,IfMatch:etag}));if(!r.Body)throw Error('Release content missing media body');return Buffer.from(await r.Body.transformToByteArray());};
 try{
  const source=await capture(0),before=await capture(1);
  const plan=buildReleaseContentPlan(source,before,{sourceHost:new URL(preview.r2PublicBaseUrl).host,destinationHost:expectedHost});
  const profiles=releaseProfilePlan(before,plan,target);
  if(planning){
   mkdirSync(join(root,'release-media-cache'),{recursive:true});
   const media=[];
   for(const key of plan.mediaKeys){
    const head=await sourceClient.send(new HeadObjectCommand({Bucket:preview.r2BucketName,Key:key}));
    const data=await bytes(sourceClient,preview.r2BucketName,key,head.ETag),sha256=releaseHash(data);
    if(data.length!==head.ContentLength)throw Error('Release content media size changed');
    const cached=join(root,'release-media-cache',sha256);if(!existsSync(cached))writeFileSync(cached,data,{flag:'wx'});else if(releaseHash(readFileSync(cached))!==sha256)throw Error('Release content backup cache differs');
    let alreadyCopied=false;try{alreadyCopied=releaseHash(await bytes(destinationClient,expectedBucket,key))===sha256;if(!alreadyCopied)throw Error('Release content destination bytes conflict');}catch(e:any){if(e.$metadata?.httpStatusCode!==404)throw e;}
    media.push({key,sha256,bytes:data.length,contentType:head.ContentType??'application/octet-stream',sourceEtag:head.ETag,alreadyCopied});
   }
   const manifest={version:1,identity,code,before,plan,profiles,media};const serialized=JSON.stringify(manifest,null,2)+'\n';writeFileSync(path,serialized,{flag:'wx'});
   console.log(JSON.stringify({mode:'plan',sha256:releaseHash(serialized),inserts:Object.fromEntries(Object.entries(plan.inserts).map(([k,v])=>[k,v.length])),profileUpdates:plan.profileUpdates.length,initializations:profiles.changes.length,mediaCopies:media.filter(m=>!m.alreadyCopied).length,seconds:(Date.now()-started)/1000}));return;
  }
  const raw=readFileSync(path);if(releaseHash(raw)!==options['--sha256'])throw Error('Release content manifest digest mismatch');
  const pinned=JSON.parse(raw.toString('utf8'));
  for(const [key,value] of Object.entries({identity,code,plan,profiles}))if(canonicalHash(pinned[key])!==canonicalHash(value))throw Error('Release content pinned '+key+' drift');
  if(canonicalHash(pinned.before.tableHashes)!==canonicalHash(before.tableHashes)||canonicalHash(pinned.before.schema)!==canonicalHash(before.schema)||canonicalHash(pinned.before.ledger)!==canonicalHash(before.ledger))throw Error('Release content destination drift');
  let copied=0;
  for(const media of pinned.media){
   if(!plan.mediaKeys.includes(media.key)||!/^([a-f0-9]{64})$/.test(media.sha256))throw Error('Release content media manifest rejected');
   const backup=readFileSync(join(root,'release-media-cache',media.sha256));if(releaseHash(backup)!==media.sha256||backup.length!==media.bytes)throw Error('Release content cached media changed');
   let present=false;try{const data=await bytes(destinationClient,expectedBucket,media.key);if(releaseHash(data)!==media.sha256)throw Error('Release content existing media conflict');present=true;}catch(e:any){if(e.$metadata?.httpStatusCode!==404)throw e;}
   if(!present){
    if(action!=='--copy')throw Error('Release content media must be copied before database apply');
    const sourceHead=await sourceClient.send(new HeadObjectCommand({Bucket:preview.r2BucketName,Key:media.key}));if(sourceHead.ETag!==media.sourceEtag)throw Error('Release content source bytes drift');
    await destinationClient.send(new PutObjectCommand({Bucket:expectedBucket,Key:media.key,Body:backup,ContentType:media.contentType,IfNoneMatch:'*',CacheControl:'public, max-age=31536000, immutable'}));copied++;
    if(releaseHash(await bytes(destinationClient,expectedBucket,media.key))!==media.sha256)throw Error('Release content copied media mismatch');
   }
  }
  if(pinned.media.length!==plan.mediaKeys.length||new Set(pinned.media.map((m:any)=>m.key)).size!==plan.mediaKeys.length)throw Error('Release content media coverage incomplete');
  let result:unknown=null;
  if(action==='--apply'||action==='--rollback-test'){
   const c=await pools[1].connect();
   try{
    try{result=await applyReleaseContent(c,pinned.before,plan,target,action==='--rollback-test');}
    catch(error){if(action!=='--rollback-test'||!(error instanceof Error)||error.message!=='EXPECTED_RELEASE_CONTENT_ROLLBACK')throw error;}
    if(action==='--rollback-test'){assertSnapshotUnchanged(pinned.before,await captureContentSnapshot(c,'preview'));result={rolledBack:true,originalDataUnchanged:true};}
   }finally{c.release();}
  }
  const receipt={at:new Date().toISOString(),action,identity,manifestSha256:options['--sha256'],copied,verifiedAssets:pinned.media.length,seconds:(Date.now()-started)/1000,result};
  writeFileSync(join(root,'release-content-result-'+Date.now()+'.json'),JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({...receipt,result:result?{databaseApplied:action==='--apply',rollbackVerified:action==='--rollback-test'}:null}));
 }finally{sourceClient.destroy();destinationClient.destroy();await Promise.all(pools.map(p=>p.end()));}
}
main().catch(error=>{console.error(error instanceof Error&&error.message.startsWith('Release content')?error.message:'Release content stopped; credentials suppressed. Inspect destination state before retrying.');process.exitCode=1});
