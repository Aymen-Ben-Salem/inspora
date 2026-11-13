import { createHash } from 'node:crypto';
import { stable, mediaFingerprint, sourceFingerprint, enrichmentEntrySchema } from './enrichment.mjs';

// Deliberately excludes publication timestamps: a reviewed draft may publish later.
// Any descriptive, taxonomy, source or media edit invalidates the note.
export function editorialContentHash(row) {
  const fields=['kind','title','description','tagline','category','industries','styles','colors','categories','themes','industry','source_url'];
  const arrays=new Set(['industries','styles','colors','categories','themes']);
  const input=Object.fromEntries(fields.map(key=>[key,row[key]??(arrays.has(key)?[]:'')]));
  input.media=(row.media??[]).map(m=>({type:m.type??'image',url:m.url,poster:m.poster??null,alt:m.alt??'',width:Number(m.width),height:Number(m.height)}));
  if(row.kind==='website') input.media.sort((a,b)=>a.type.localeCompare(b.type));
  return createHash('sha256').update(stable(input)).digest('hex');
}

export function reviewedEditorialEntries(rows, notes=[]) {
  const byId=new Map(rows.map(row=>[row.id,row]));
  return notes.flatMap(note=>{
    const row=byId.get(note.work_id);
    if(!row || row.kind!==note.kind || editorialContentHash(row)!==note.content_hash) return [];
    const result=enrichmentEntrySchema.safeParse({id:row.id,sourceFingerprint:sourceFingerprint(row),...note.notes,
      evidence:{mediaMetadataSha256:mediaFingerprint(row),primarySha256:note.evidence[0],frameSha256:note.evidence.slice(1),reviewedAt:new Date(note.reviewed_at).toISOString()}});
    return result.success?[result.data]:[];
  });
}
