import {mediaFingerprint} from '../enrichment.mjs';

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
