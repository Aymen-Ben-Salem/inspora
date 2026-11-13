// Maintainer-only publication to one owned object in private production storage.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {loadProductionMediaEnvironment,assertProductionMediaEnvironment} from './lib/production-environment.ts';
import {parseEnrichment} from '../tools/inspora-mcp/enrichment.mjs';
import {ENRICHMENT_KEY} from '../tools/inspora-mcp/hosted-feed.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply');
const option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
for(let i=0;i<args.length;i++){if(['--apply','--confirm-production'].includes(args[i]))continue;if(['--input','--expected-sha256','--evidence'].includes(args[i])){if(!args[++i]||args[i].startsWith('--'))throw Error('Missing publication option');}else throw Error('Unknown publication option');}
if(apply&&!args.includes('--confirm-production'))throw Error('Publication requires --confirm-production');
const environment=loadProductionMediaEnvironment();
const destination={...environment,r2SubmissionsBucketName:process.env.R2_SUBMISSIONS_BUCKET_NAME};
if(destination.r2SubmissionsBucketName!=='inspora-submissions-production')throw Error('Private storage identity mismatch');
const notes=parseEnrichment(JSON.parse(fs.readFileSync(option('--input','tools/inspora-mcp/data/enrichment.json'),'utf8')));
const body=JSON.stringify(notes),sha=value=>createHash('sha256').update(value).digest('hex');
if(Buffer.byteLength(body)>4*1024*1024)throw Error('Notes exceed the object budget');
const storage=new S3Client({region:'auto',endpoint:`https://${destination.r2AccountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:destination.r2AccessKeyId,secretAccessKey:destination.r2SecretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED'});
try {
  let previous=null,etag;
  try {const object=await storage.send(new GetObjectCommand({Bucket:destination.r2SubmissionsBucketName,Key:ENRICHMENT_KEY}));previous=await object.Body.transformToString();etag=object.ETag;}
  catch(error){if(error.name!=='NoSuchKey'&&error.$metadata?.httpStatusCode!==404)throw Error('Cannot inspect notes object');}
  const receipt={mode:apply?'apply':'dry-run',at:new Date().toISOString(),entries:notes.entries.length,beforeSha256:previous===null?null:sha(previous),afterSha256:sha(body)};
  const directory=path.resolve(option('--evidence','.scratch/inspora-production-catalog-20261113'));
  if(!directory.startsWith(path.resolve('.scratch')+path.sep))throw Error('Evidence must stay in .scratch');
  if(apply){
    if(previous!==null&&option('--expected-sha256')!==sha(previous))throw Error('Existing object requires its exact expected SHA-256');
    fs.mkdirSync(directory,{recursive:true});
    if(previous!==null)fs.writeFileSync(path.join(directory,`enrichment-before-${Date.now()}.json`),previous,{flag:'wx'});
    assertProductionMediaEnvironment(environment);
    await storage.send(new PutObjectCommand({Bucket:destination.r2SubmissionsBucketName,Key:ENRICHMENT_KEY,Body:body,ContentType:'application/json',CacheControl:'private, no-store',...(etag?{IfMatch:etag}:{IfNoneMatch:'*'})}));
    const verified=await storage.send(new GetObjectCommand({Bucket:destination.r2SubmissionsBucketName,Key:ENRICHMENT_KEY}));
    if(sha(await verified.Body.transformToString())!==receipt.afterSha256)throw Error('Stored notes verification failed');
    fs.writeFileSync(path.join(directory,'enrichment-publication.json'),JSON.stringify(receipt,null,2));
  }
  console.log(JSON.stringify(receipt));
} finally {storage.destroy();}
