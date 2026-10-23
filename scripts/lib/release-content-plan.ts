import {canonicalHash,D1,EXCLUDED_WEBSITE_ID,type ContentSnapshot,type Row} from './content-transfer-plan';
import {normalizeXProfileUrl,validateCreatorUsername} from '../../src/features/creators/validation';
import {assertNoPreviewSponsorshipTransfer,EDITORIAL_RELEASE_TABLES} from './sponsor-release-policy';
import {prepareReleaseIdentities,type ReleaseIdentityDecisions} from './release-content-identities';

function fail(reason:string):never{throw Error('Release content: '+reason);}
const tables=EDITORIAL_RELEASE_TABLES;
const clean=(row:Row)=>Object.fromEntries(Object.entries(row).filter(([k])=>!['has_owner','has_verified_x','owner_user_id','x_provider_id','created_by','updated_by'].includes(k)));
const xIdentity=(row:Row)=>{try{return normalizeXProfileUrl(String(row.x_profile_url||row.url||''));}catch{return null;}};

/** Editorial work only. Ownership requires a separately reviewed account subplan. */
export function buildReleaseContentPlan(source:ContentSnapshot,destination:ContentSnapshot,options:{sourceHost:string;destinationHost:string;decisions?:ReleaseIdentityDecisions}){
 if(options.sourceHost===options.destinationHost)fail('identical storage origins');
 const rewrite=(value:unknown):unknown=>{
  if(typeof value==='string'&&value.startsWith('https://'+options.sourceHost+'/'))return 'https://'+options.destinationHost+'/'+value.slice(('https://'+options.sourceHost+'/').length);
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  return value;
 };
 const identities=prepareReleaseIdentities(source,destination,options.decisions,rewrite);
 const s=identities.source.rows,d=identities.destination.rows,inserts:Record<string,Row[]>={};
 for(const table of tables){
  if(!s[table]||!d[table])fail('missing table '+table);
  for(const rows of [s[table],d[table]])if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('duplicate ID in '+table);
  inserts[table]=[];
 }
 const logos=s.logos,websites=s.websites.filter(r=>r.id!==EXCLUDED_WEBSITE_ID);
 const logoIds=new Set(logos.map(r=>r.id)),websiteIds=new Set(websites.map(r=>r.id));
 const creatorIds=new Set([...logos,...websites].map(r=>r.creator_id));
 const profileUpdates:{id:string;username:string}[]=[],mediaKeys=new Set<string>();
 const media=(value:unknown,allowUrlOnly=false):void=>{
  if(Array.isArray(value)){value.forEach(v=>media(v));return;}
  if(!value||typeof value!=='object')return;
  const r=value as Row;
  for(const [urlKey,keyKeys] of [['url',['storage_key','storageKey']],['poster_url',['poster_storage_key']],['avatar_url',['avatar_storage_key']]] as const){
   let key=keyKeys.map(k=>r[k]).find(Boolean);const url=r[urlKey];
   // The schema permits legacy URL-only website assets. Include their exact
   // same-origin object dependency without changing nullable storage metadata.
   if(!key&&allowUrlOnly&&urlKey==='url'&&typeof url==='string'&&url.startsWith('https://'+options.sourceHost+'/'))key=decodeURIComponent(new URL(url).pathname.slice(1));
   if(typeof url==='string'&&url.startsWith('https://'+options.sourceHost+'/')&&!key)fail('missing managed media key');
   if(key){
    if(typeof url!=='string'||typeof key!=='string'||!key||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))fail('invalid media reference');
    const u=new URL(url as string);
    if(u.protocol!=='https:'||u.host!==options.sourceHost||u.search||u.hash||decodeURIComponent(u.pathname.slice(1))!==key)fail('media URL/key mismatch');
    mediaKeys.add(key as string);
   }
  }
  Object.values(r).forEach(v=>media(v));
 };
 const add=(table:string,sourceRow:Row,inspectMedia=false)=>{
  if(inspectMedia)media(sourceRow,table==='website_media'&&sourceRow.storage_key==null&&sourceRow.storage_provider==null);
  const row=rewrite(clean(sourceRow)) as Row,existing=d[table].find(r=>r.id===row.id);
  if(existing){
   if(Object.entries(row).some(([k,v])=>canonicalHash(v)!==canonicalHash(existing[k])))fail('existing '+table+' differs: '+row.id);
  }else{
   if(row.slug&&[...d[table],...inserts[table]].some(r=>r.slug===row.slug))fail('slug collision in '+table);
   if(destination.schema.length&&Object.keys(row).some(k=>!destination.schema.some(c=>c.table_name===table&&c.column_name===k)))fail('destination schema requires migration: '+table);
   inserts[table].push(row);
  }
 };
 for(const id of [...creatorIds].sort()){
  const c=s.creators.find(r=>r.id===id);if(!c)fail('missing credited creator');
  if(c.has_owner||c.has_verified_x||c.owner_user_id||c.x_provider_id||c.record_origin==='user'||c.record_origin==='development')fail('account ownership requires an approved subplan');
  const existing=d.creators.find(r=>r.id===id);
  if(existing?.has_owner||existing?.has_verified_x)fail('destination identity is owned');
  const identity=xIdentity(c);
  if(identity&&s.creators.some(r=>r.id!==id&&creatorIds.has(r.id)&&xIdentity(r)===identity))fail('unapproved duplicate selected X identity');
  if(identity&&d.creators.some(r=>r.id!==id&&xIdentity(r)===identity))fail('unapproved duplicate X identity');
  const username=c.username;
  if(typeof username!=='string'||!validateCreatorUsername(username).ok)fail('invalid selected creator username');
  if(d.creators.some(r=>r.id!==id&&String(r.username??'').toLowerCase()===String(username).toLowerCase())||d.creator_username_aliases.some(r=>r.creator_id!==id&&String(r.username).toLowerCase()===String(username).toLowerCase()))fail('creator route collision');
  if(existing){
   if(existing.username&&existing.username!==username)fail('existing creator route differs');
   if(!existing.username){if(id!==D1.survivor&&!identities.approvedProfiles.has(String(id)))fail('unapproved existing creator profile mapping');profileUpdates.push({id:String(id),username:username as string});}
  }else add('creators',{...c,record_origin:'editorial'},true);
  const aliases=s.creator_username_aliases.filter(r=>r.creator_id===id);
  if(aliases.filter(r=>r.is_current&&r.username===username).length!==1||aliases.filter(r=>r.is_current).length!==1)fail('selected current alias mismatch');
  for(const alias of aliases){
   const match=d.creator_username_aliases.find(r=>String(r.username).toLowerCase()===String(alias.username).toLowerCase());
   if(match){if(match.creator_id!==id||match.is_current!==alias.is_current)fail('alias collision');}
   else add('creator_username_aliases',alias);
  }
 }
 for(const logo of logos){if(!['logo','icon'].includes(String(logo.kind)))fail('invalid logo kind');if(!s.logo_media.some(r=>r.logo_id===logo.id))fail('missing logo media');add('logos',logo);}
 for(const website of websites){
  const rows=s.website_media.filter(r=>r.website_id===website.id),recording=rows.find(r=>r.role==='recording');
  if(!recording?.poster_url||!recording.video_preview||!rows.some(r=>r.role==='favicon'))fail('missing website presentation');
  if(!Array.isArray(website.technologies)||website.technologies.some(t=>typeof t!=='string'))fail('invalid website technologies');
  add('websites',website);
 }
 for(const row of s.logo_media.filter(r=>logoIds.has(r.logo_id)))add('logo_media',row,true);
 for(const table of ['website_media','website_sections'])for(const row of s[table].filter(r=>websiteIds.has(r.website_id)))add(table,row,true);
 for(const mapping of options.decisions?.mappings??[])media(mapping.profile);
 const reviewedUpdates=identities.updates.map(change=>({...change,values:rewrite(change.values) as Row}));
 const plan={inserts,profileUpdates,reviewedUpdates,mediaKeys:[...mediaKeys].sort(),selectedCreatorIds:[...creatorIds].map(String).sort(),selectedWorkIds:[...logoIds,...websiteIds].map(String).sort()};
 assertNoPreviewSponsorshipTransfer(plan,{
  creators:s.creators.filter(r=>creatorIds.has(r.id)),
  logo_media:s.logo_media.filter(r=>logoIds.has(r.logo_id)),
  website_media:s.website_media.filter(r=>websiteIds.has(r.website_id)),
  website_sections:s.website_sections.filter(r=>websiteIds.has(r.website_id)),
 });
 return plan;
}
