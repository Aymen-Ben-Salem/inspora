import {z} from 'zod';
import {feedSchema} from '../feed-schema.mjs';
import {normalizeRows,sha} from '../catalog.mjs';
import {stable} from '../enrichment.mjs';
import {MODEL,unit} from './embeddings.mjs';

export const POINTER_KEY='mcp/hosted/v1/current.json';
export const FENCE_KEY='mcp/hosted/v1/delivery.json';
export const MAX_SOURCE_AGE_MS=180000;
export const REPAIR_INTERVAL_MS=12*60*60*1000;
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const date=z.string().refine(value=>Number.isFinite(Date.parse(value)));
export const pointerSchema=z.object({version:z.literal(1),snapshotId:hash,objectKey:z.string().regex(/^mcp\/hosted\/v1\/indexes\/[a-f0-9]{64}\.json$/),sourceCheckedAt:date,eventDriven:z.boolean().optional(),pendingWorks:z.number().int().nonnegative().optional()}).strict();

export function catalogIndex(rows,capturedAt){return {version:1,variant:'cloudflare-enriched',model:MODEL,snapshotId:sha(stable({model:MODEL,rows})),capturedAt,rows};}

export function safeInterim(input,previous){
  const feed=feedSchema.parse(input),rows=normalizeRows(feed.catalog,null,'enriched',feed.enrichment);
  const cache=new Map(stable(previous?.model)===stable(MODEL)?previous.rows.map(row=>[row.textHash,row.vector]):[]);
  const ready=rows.filter(row=>cache.has(row.textHash)).map(row=>({...row,vector:cache.get(row.textHash)}));
  return {...catalogIndex(ready,feed.catalog.capturedAt),pendingWorks:rows.length-ready.length};
}

export async function buildCatalog(input,{embed,previous,now=()=>Date.now()}={}) {
  const feed=feedSchema.parse(input),captured=Date.parse(feed.catalog.capturedAt);
  if(captured>now()+60000||now()-captured>MAX_SOURCE_AGE_MS)throw Error('CATALOG_SOURCE_STALE');
  const rows=normalizeRows(feed.catalog,null,'enriched',feed.enrichment);
  const cache=new Map();
  if(previous&&stable(previous.model)===stable(MODEL))for(const row of previous.rows)cache.set(row.textHash,unit(row.vector));
  const missing=rows.filter(row=>!cache.has(row.textHash));
  for(let offset=0;offset<missing.length;offset+=16){
    const batch=missing.slice(offset,offset+16),vectors=await embed(batch.map(row=>row.text));
    if(vectors.length!==batch.length)throw Error('EMBEDDING_INVALID');
    batch.forEach((row,i)=>cache.set(row.textHash,unit(vectors[i])));
  }
  for(const row of rows)row.vector=cache.get(row.textHash);
  return catalogIndex(rows,feed.catalog.capturedAt);
}

// Upload the immutable complete index first. The last write commits the pointer.
// Callers must serialize publishers; source time guards are not a distributed lock.
export async function publishCatalog(bucket,index,{now=()=>Date.now(),eventDriven=false}={}) {
  if(stable(index.model)!==stable(MODEL))throw Error('CATALOG_MODEL_MISMATCH');
  const captured=Date.parse(index.capturedAt);
  if(!Number.isFinite(captured)||now()-captured>MAX_SOURCE_AGE_MS||captured>now()+60000)throw Error('CATALOG_SOURCE_STALE');
  const current=await bucket.get(POINTER_KEY);
  if(current){const pointer=pointerSchema.parse(await current.json());if(Date.parse(pointer.sourceCheckedAt)>captured)throw Error('CATALOG_SOURCE_OUT_OF_ORDER');}
  const objectKey=`mcp/hosted/v1/indexes/${index.snapshotId}.json`;
  await bucket.put(objectKey,JSON.stringify(index),{httpMetadata:{contentType:'application/json'}});
  const pointer={version:1,snapshotId:index.snapshotId,objectKey,sourceCheckedAt:index.capturedAt,...(eventDriven?{eventDriven:true,pendingWorks:index.pendingWorks??0}:{})};
  await bucket.put(POINTER_KEY,JSON.stringify(pointer),{httpMetadata:{contentType:'application/json'}});
  return pointer;
}

export function createCatalogReader({now=()=>Date.now()}={}) {
  let cached;
  return async bucket=>{
    const object=await bucket.get(POINTER_KEY);
    if(!object)throw Error('CATALOG_UNAVAILABLE');
    const pointer=pointerSchema.parse(await object.json()),age=now()-Date.parse(pointer.sourceCheckedAt);
    if(age>(pointer.eventDriven?REPAIR_INTERVAL_MS+60000:MAX_SOURCE_AGE_MS)||age< -60000)throw Error('CATALOG_STALE');
    if(pointer.eventDriven){const fence=await bucket.get(FENCE_KEY),delivery=fence?await fence.json():null;if(!delivery||delivery.pending||delivery.snapshotId!==pointer.snapshotId)throw Error('CATALOG_UPDATING');}
    if(cached?.snapshotId!==pointer.snapshotId){
      const blob=await bucket.get(pointer.objectKey);
      if(!blob||blob.size>24*1024*1024)throw Error('CATALOG_UNAVAILABLE');
      const index=await blob.json();
      if(index.snapshotId!==pointer.snapshotId||stable(index.model)!==stable(MODEL)||!Array.isArray(index.rows)||index.rows.length>10000)throw Error('CATALOG_MODEL_MISMATCH');
      if(sha(stable({model:index.model,rows:index.rows}))!==index.snapshotId)throw Error('CATALOG_INTEGRITY');
      for(const row of index.rows)unit(row.vector);
      cached=index;
    }
    // Capture time can advance without invalidating continuation for unchanged content.
    return {...cached,capturedAt:pointer.sourceCheckedAt,delivery:{eventDriven:pointer.eventDriven??false,repairIntervalHours:pointer.eventDriven?12:null,pendingWorks:pointer.pendingWorks??0}};
  };
}
