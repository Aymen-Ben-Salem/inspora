import crypto from 'node:crypto';
export const KINDS=['design','website','logo','icon'];
export const tagFields=['category','industries','styles','colors','categories','themes','technologies','industry','shape'];
export const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const clean=(s,n=800)=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,n);
export function eligible(r,at=Date.now()){return KINDS.includes(r.kind)&&r.status==='published'&&r.creator_visible===true&&Number.isFinite(Date.parse(r.published_at))&&Date.parse(r.published_at)<=at&&(r.kind!=='website'||r.media?.some(m=>m.type==='recording'&&m.poster&&m.preview!=null)&&r.media?.some(m=>m.type==='favicon'));}
export function publicUrl(r){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug))throw Error('Invalid catalog slug');return 'https://www.inspora.design/'+(r.kind==='design'?'posts/'+r.slug:r.kind==='website'?'websites?website='+r.slug:'logos?logo='+r.slug);}
export function resolveReference(raw,rows){let u;try{u=new URL(raw);}catch{throw Error('INVALID_REFERENCE: use a public Inspora work link');}if(u.protocol!=='https:'||!['inspora.design','www.inspora.design'].includes(u.hostname)||u.port||u.username||u.password||u.hash)throw Error('INVALID_REFERENCE: external or credential-bearing URLs are not supported; uploaded images are Phase 2');let slug,kinds;
if(/^\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(u.pathname)&&!u.search){slug=u.pathname.split('/')[2];kinds=['design'];}
else if(u.pathname==='/logos'&&[...u.searchParams.keys()].length===1&&u.searchParams.has('logo')){slug=u.searchParams.get('logo');kinds=['logo','icon'];}
else if(u.pathname==='/websites'&&[...u.searchParams.keys()].length===1&&u.searchParams.has('website')){slug=u.searchParams.get('website');kinds=['website'];}
else throw Error('INVALID_REFERENCE: expected /posts/slug, /logos?logo=slug, or /websites?website=slug');
const r=rows.find(r=>r.slug===slug&&kinds.includes(r.kind));if(!r)throw Error('REFERENCE_NOT_ELIGIBLE: link is absent from this dated eligible catalog');return r;}
export function document(r){return [r.title,r.description,r.tagline,...tagFields.flatMap(f=>r[f]??[]),r.searchOnly??''].join(' ').slice(0,6500);}
export function normalizeRows(snapshot,manifest,variant='original'){
const seen=new Set();return snapshot.rows.filter(r=>eligible(r,Date.parse(snapshot.capturedAt))).map(r=>{
if(seen.has(r.id))throw Error('Duplicate work ID');seen.add(r.id);const draft=variant==='draft'?manifest?.drafts.find(d=>d.id===r.id):undefined;
if(draft&&(draft.sourceVersion.updatedAt!==r.updated_at||draft.sourceVersion.mediaMetadataSha256!==sha(r.media)))throw Error('Stale draft; recapture and review '+r.id);
const effective=draft?{...r,...draft.proposed}:r;
const base={id:r.id,kind:r.kind,slug:r.slug,title:clean(r.title,120),creator:clean(r.creator_name,100),url:publicUrl(r),description:clean(effective.description,1600),tagline:clean(r.tagline,300),status:r.status,published_at:r.published_at,creator_visible:r.creator_visible,media:r.media,searchOnly:draft?clean(draft.searchOnly,2000):'',...Object.fromEntries(tagFields.map(f=>[f,effective[f]??[]]))};base.text=document(base);base.textHash=sha(base.text);return base;});}
