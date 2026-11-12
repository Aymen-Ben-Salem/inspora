// Maintainer-only publication of reviewed notes to the existing private Preview bucket.
// Never uploads account data, model weights or production media/configuration.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {loadContentTransferEnvironment} from './lib/content-transfer-environment.ts';
import {parseEnrichment} from '../tools/inspora-mcp/enrichment.mjs';
import {ENRICHMENT_KEY} from '../tools/inspora-mcp/hosted-feed.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply');
const option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
for(let i=0;i<args.length;i++){if(args[i]==='--apply')continue;if(['--input','--expected-sha256','--evidence'].includes(args[i])){if(!args[++i]||args[i].startsWith('--'))throw Error('Missing publication option');}else throw Error('Unknown publication option');}
const branch=(await import('node:child_process')).execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
if(branch!=='preview/archive-updates')throw Error('Publication requires the approved Preview branch');
const environment=loadContentTransferEnvironment(),preview=environment.preview;
const notes=parseEnrichment(JSON.parse(fs.readFileSync(option('--input','tools/inspora-mcp/data/enrichment.json'),'utf8')));
const body=JSON.stringify(notes),sha=value=>createHash('sha256').update(value).digest('hex');
if(Buffer.byteLength(body)>4*1024*1024)throw Error('Notes exceed the object budget');
const storage=new S3Client({region:'auto',endpoint:`https://${preview.r2AccountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:preview.r2AccessKeyId,secretAccessKey:preview.r2SecretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED'});
try {
  let previous=null,etag;
  try {const object=await storage.send(new GetObjectCommand({Bucket:preview.r2SubmissionsBucketName,Key:ENRICHMENT_KEY}));previous=await object.Body.transformToString();etag=object.ETag;}
  catch(error){if(error.name!=='NoSuchKey'&&error.$metadata?.httpStatusCode!==404)throw Error('Cannot inspect Preview notes object');}
  const receipt={mode:apply?'apply':'dry-run',at:new Date().toISOString(),entries:notes.entries.length,beforeSha256:previous===null?null:sha(previous),afterSha256:sha(body)};
  const directory=path.resolve(option('--evidence','.scratch/inspora-shared-catalog-20261112'));
  if(!directory.startsWith(path.resolve('.scratch')+path.sep))throw Error('Evidence must stay in .scratch');
  if(apply){
    if(previous!==null&&option('--expected-sha256')!==sha(previous))throw Error('Existing object requires its exact expected SHA-256');
    fs.mkdirSync(directory,{recursive:true});
    if(previous!==null)fs.writeFileSync(path.join(directory,`enrichment-before-${Date.now()}.json`),previous,{flag:'wx'});
    environment.guard();
    await storage.send(new PutObjectCommand({Bucket:preview.r2SubmissionsBucketName,Key:ENRICHMENT_KEY,Body:body,ContentType:'application/json',CacheControl:'private, no-store',...(etag?{IfMatch:etag}:{IfNoneMatch:'*'})}));
    const verified=await storage.send(new GetObjectCommand({Bucket:preview.r2SubmissionsBucketName,Key:ENRICHMENT_KEY}));
    if(sha(await verified.Body.transformToString())!==receipt.afterSha256)throw Error('Stored notes verification failed');
    fs.writeFileSync(path.join(directory,'enrichment-publication.json'),JSON.stringify(receipt,null,2));
  }
  console.log(JSON.stringify(receipt));
} finally {storage.destroy();}
