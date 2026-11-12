import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {normalizeRows,sha} from './catalog.mjs';
import {MODEL} from './model.mjs';
import {stable} from './enrichment.mjs';

export async function buildIndex(snapshot,{enrichment,manifest,variant='enriched',previous=[],embed,onProgress=()=>{}}) {
  const cache=new Map();
  for(const index of previous)if(JSON.stringify(index.model)===JSON.stringify(MODEL))for(const row of index.rows)cache.set(row.textHash,row.vector);
  const rows=normalizeRows(snapshot,manifest,variant,enrichment),missing=rows.filter(row=>!cache.has(row.textHash));
  for(let at=0;at<missing.length;at+=32){
    const batch=missing.slice(at,at+32),vectors=await embed(batch.map(row=>row.text));
    if(vectors.length!==batch.length||vectors.some(vector=>!Array.isArray(vector)||vector.length!==384||vector.some(value=>!Number.isFinite(value))))throw Error('Invalid embedding result');
    batch.forEach((row,i)=>cache.set(row.textHash,vectors[i]));onProgress(Math.min(at+32,missing.length),missing.length);
  }
  for(const row of rows)row.vector=cache.get(row.textHash);
  return {version:1,variant,capturedAt:snapshot.capturedAt,builtAt:new Date().toISOString(),sourceRevision:sha(stable([...snapshot.rows].sort((a,b)=>a.id.localeCompare(b.id)))),snapshotId:sha({variant,rows}),model:MODEL,enrichment:{current:rows.filter(r=>r.enrichmentStatus==='current').length,stale:rows.filter(r=>r.enrichmentStatus==='stale').length,missing:rows.filter(r=>r.enrichmentStatus==='missing').length,typography:rows.filter(r=>r.hasTypography).length},rows};
}
export function writeAtomic(target,value) {
  const temporary=target+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(value));fs.renameSync(temporary,target);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
