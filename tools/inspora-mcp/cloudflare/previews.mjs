import {mediaFingerprint} from '../enrichment.mjs';
import {preparedVisuals,encodedBytes,LEGACY_STATUS,VISUAL_BUDGET_STATUS} from '../visuals.mjs';

export const MAX_PREVIEW_BYTES=256000;
export const previewKey=row=>`mcp/hosted/v1/previews/${mediaFingerprint(row)}.png`;
const signature=[137,80,78,71,13,10,26,10];

// Only selected, currently eligible rows can reach this function. No external fetch.
export async function selectedPreview(bucket,row){
  try{
    const object=await bucket.get(previewKey(row));
    if(!object)return {status:'No prepared thumbnail for current media; use the public link.'};
    if(object.size>MAX_PREVIEW_BYTES)return {status:'Prepared thumbnail exceeds the size limit; use the public link.'};
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(bytes.length>MAX_PREVIEW_BYTES||!signature.every((value,i)=>bytes[i]===value))return {status:'Prepared thumbnail is unavailable; use the public link.'};
    return {bytes};
  }catch{return {status:'Prepared thumbnail is temporarily unavailable; use the public link.'};}
}

export async function hostedVisuals(bucket,row,options) {
  const pack=await preparedVisuals(row,async (key,limit)=>{
    const object=await bucket.get(key);
    if(!object||object.size>limit)return null;
    const bytes=new Uint8Array(await object.arrayBuffer());
    return bytes.length<=limit?bytes:null;
  },options);
  // A valid pack stopped by the budget is reported as such, never replaced by a legacy thumbnail.
  if(pack.images.length||pack.truncated)return pack;
  if(options.budget<4)return {...pack,status:VISUAL_BUDGET_STATUS,truncated:true};
  const legacy=await selectedPreview(bucket,row);
  if(legacy.bytes&&encodedBytes(legacy.bytes.length)<=options.budget){
    return {status:LEGACY_STATUS,images:[{bytes:legacy.bytes,mimeType:'image/png'}]};
  }
  return legacy.bytes?{...pack,status:VISUAL_BUDGET_STATUS,truncated:true,omitted_roles:['legacy_thumbnail']}:{...pack,status:legacy.status};
}
