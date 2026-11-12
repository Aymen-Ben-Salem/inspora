import {z} from 'zod';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');

export const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export const mediaFingerprint=row=>sha(stable(row.media??[]));
const sourceFields=['id','kind','slug','title','description','tagline','creator_name','creator_username','category','industries','styles','colors','categories','themes','technologies','industry','shape','source_url','status','published_at','updated_at','creator_updated_at','creator_visible','media'];
const timestamp=value=>{const date=new Date(value),fraction=String(value).match(/\.(\d+)/)?.[1]??'';return date.toISOString().replace(/\.\d{3}Z$/,'')+'.'+fraction.padEnd(6,'0').slice(0,6)+'Z';};
export function sourceFingerprint(row) {
  const source=Object.fromEntries(sourceFields.map(key=>[key,key.endsWith('_at')&&Number.isFinite(Date.parse(row[key]))?timestamp(row[key]):row[key]??null]));
  return sha(stable(source));
}
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const date=z.string().refine(value=>Number.isFinite(Date.parse(value)),'Invalid date');
export const enrichmentEntrySchema=z.object({
  id:z.string().uuid(),sourceFingerprint:hash,
  scope:z.enum(['component','webpage','brand','motion','illustration','object','icon','interface','lettering']),
  visualNotes:z.string().trim().min(10).max(1400),
  typography:z.string().trim().min(10).max(500).nullable(),
  typographyIsSubject:z.boolean().default(false),
  evidence:z.object({mediaMetadataSha256:hash,primarySha256:hash,frameSha256:z.array(hash).max(12),reviewedAt:date}).strict(),
}).strict().superRefine((entry,context)=>{
  if(entry.typography&&!['webpage','brand','interface','lettering'].includes(entry.scope)&&!entry.typographyIsSubject)
    context.addIssue({code:'custom',message:'Typography requires an overall composition/identity or a lettering subject'});
});
export const enrichmentSchema=z.object({version:z.literal(1),entries:z.array(enrichmentEntrySchema).max(10000)}).strict();
export function parseEnrichment(input={version:1,entries:[]}) {
  const manifest=enrichmentSchema.parse(input),ids=new Set();
  for(const entry of manifest.entries){if(ids.has(entry.id))throw Error('Duplicate enrichment work ID');ids.add(entry.id);}
  return manifest;
}
export function currentEnrichment(row,entry) {
  return Boolean(entry&&entry.sourceFingerprint===sourceFingerprint(row)&&entry.evidence.mediaMetadataSha256===mediaFingerprint(row));
}
