import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const prior=path.resolve(dir,'../../.scratch/inspiration-search-readiness-20261109/rich-content-test');
export const modelCache=process.env.INSPORA_MODEL_CACHE|| (fs.existsSync(path.join(prior,'model-cache'))?path.join(prior,'model-cache'):path.join(dir,'models'));
export const MODEL={name:'Xenova/all-MiniLM-L6-v2',revision:'751bff37182d3f1213fa05d7196b954e230abad9',runtime:'3.8.1',dtype:'q8',device:'cpu'};
let pending;
export async function encoder(){
  if(!pending)pending=(async()=>{const require=createRequire(import.meta.url);const entry=require.resolve('@huggingface/transformers');const packageInfo=JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry),'../package.json')));if(packageInfo.version!==MODEL.runtime)throw Error('Pinned Transformers runtime unavailable');const imported=await import(pathToFileURL(entry).href);const {pipeline,env}=imported.default??imported;env.cacheDir=modelCache;env.allowLocalModels=true;env.allowRemoteModels=false;return pipeline('feature-extraction',MODEL.name,{revision:MODEL.revision,dtype:MODEL.dtype,device:MODEL.device,local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});})();
  return pending;
}
export async function embed(texts){const e=await encoder();const vectors=[];for(let i=0;i<texts.length;i+=8){const out=await e(texts.slice(i,i+8),{pooling:'mean',normalize:true});vectors.push(...out.tolist());}return vectors;}
export async function dispose(){if(pending){await (await pending).dispose();pending=undefined;}}
