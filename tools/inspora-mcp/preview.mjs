import fs from 'node:fs';
import path from 'node:path';
import {sha} from './catalog.mjs';
import {mediaFingerprint} from './enrichment.mjs';
import {preparedVisuals} from './visuals.mjs';

export function localPreview(row, manifest, mediaDirectory) {
  const entry = manifest.drafts?.find(d => d.id === row.id);
  if (!entry || !/^[A-Z]\d{2,3}$/.test(entry.label)) return {status: 'No locally prepared thumbnail; URL only'};
  if (manifest.version!==undefined&&![1,2].includes(manifest.version)) return {status: 'Unsupported thumbnail manifest; URL only'};
  const fingerprint=manifest.version===2?mediaFingerprint(row):sha(row.media);
  if (entry.sourceVersion?.mediaMetadataSha256 !== fingerprint) return {status: 'Local thumbnail is stale; URL only'};
  const file = path.join(mediaDirectory, entry.label + '-thumb-0.png');
  if (!fs.existsSync(file)) return {status: 'Local thumbnail unavailable; URL only'};
  if (fs.statSync(file).size > 256000) return {status: 'Local thumbnail exceeds 256 KB; URL only'};
  return {bytes: fs.readFileSync(file)};
}

export async function localVisuals(dataDirectory,row,options) {
  const pack=await preparedVisuals(row,(key,limit)=>{
    const file=path.join(dataDirectory,'visuals',...key.split('/'));
    const stat=fs.statSync(file,{throwIfNoEntry:false});
    if(!stat?.isFile()||stat.size>limit)return null;
    const bytes=fs.readFileSync(file);
    return bytes.length<=limit?bytes:null;
  },options);
  if(pack.images.length||options.budget<4)return pack;
  const manifestPath=path.join(dataDirectory,'preview-manifest.json');
  try {
    const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{drafts:[]};
    const legacy=localPreview(row,manifest,path.join(dataDirectory,'media'));
    if(legacy.bytes&&legacy.bytes.length<=options.budget){
      return {status:'prepared_current_media',images:[{bytes:legacy.bytes,mimeType:'image/png'}]};
    }
    return {...pack,status:legacy.bytes?'Image response budget reached; URL only':legacy.status};
  } catch {
    return {...pack,status:'Prepared preview unavailable; URL only'};
  }
}
