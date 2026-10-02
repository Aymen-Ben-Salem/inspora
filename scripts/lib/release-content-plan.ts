import {canonicalHash,D1,EXCLUDED_WEBSITE_ID,type ContentSnapshot,type Row} from './content-transfer-plan';
import {normalizeXProfileUrl,validateCreatorUsername} from '../../src/features/creators/validation';

function fail(reason:string):never{throw Error('Release content: '+reason);}
const tables=['creators','creator_username_aliases','logos','logo_media','websites','website_media','website_sections'] as const;
const clean=(row:Row)=>Object.fromEntries(Object.entries(row).filter(([k])=>!['has_owner','has_verified_x','owner_user_id','x_provider_id','created_by','updated_by'].includes(k)));
const xIdentity=(row:Row)=>{try{return normalizeXProfileUrl(String(row.x_profile_url||row.url||''));}catch{return null;}};

/** Editorial work only. Ownership requires a separately reviewed account subplan. */
export function buildReleaseContentPlan(source:ContentSnapshot,destination:ContentSnapshot,options:{sourceHost:string;destinationHost:string}){
 if(options.sourceHost===options.destinationHost)fail('identical storage origins');
 const s=source.rows,d=destination.rows,inserts:Record<string,Row[]>={};
 for(const table of tables){
  if(!s[table]||!d[table])fail('missing table '+table);
  for(const rows of [s[table],d[table]])if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('duplicate ID in '+table);
  inserts[table]=[];
 }
 const logos=s.logos,websites=s.websites.filter(r=>r.id!==EXCLUDED_WEBSITE_ID);
 const logoIds=new Set(logos.map(r=>r.id)),websiteIds=new Set(websites.map(r=>r.id));
 const creatorIds=new Set([...logos,...websites].map(r=>r.creator_id));
 const profileUpdates:{id:string;username:string}[]=[],mediaKeys=new Set<string>();
 const rewrite=(value:unknown):unknown=>{
  if(typeof value==='string'&&value.startsWith('https://'+options.sourceHost+'/'))return 'https://'+options.destinationHost+'/'+value.slice(('https://'+options.sourceHost+'/').length);
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  return value;
 };
 const media=(value:unknown):void=>{
  if(Array.isArray(value)){value.forEach(media);return;}
  if(!value||typeof value!=='object')return;
  const r=value as Row;
  for(const [urlKey,keyKeys] of [['url',['storage_key','storageKey']],['poster_url',['poster_storage_key']],['avatar_url',['avatar_storage_key']]] as const){
   const key=keyKeys.map(k=>r[k]).find(Boolean),url=r[urlKey];
   if(typeof url==='string'&&url.startsWith('https://'+options.sourceHost+'/')&&!key)fail('missing managed media key');
   if(key){
    if(typeof url!=='string'||typeof key!=='string'||!key||key.startsWith('/')||key.split('/').includes('..'))fail('invalid media reference');
    const u=new URL(url as string);
    if(u.protocol!=='https:'||u.host!==options.sourceHost||u.search||u.hash||decodeURIComponent(u.pathname.slice(1))!==key)fail('media URL/key mismatch');
    mediaKeys.add(key as string);
   }
  }
  Object.values(r).forEach(media);
 };
 const add=(table:string,sourceRow:Row,inspectMedia=false)=>{
  if(inspectMedia)media(sourceRow);
  const row=rewrite(clean(sourceRow)) as Row,existing=d[table].find(r=>r.id===row.id);
  if(existing){
   if(Object.entries(row).some(([k,v])=>canonicalHash(v)!==canonicalHash(existing[k])))fail('existing '+table+' differs: '+row.id);
  }else{
   if(row.slug&&d[table].some(r=>r.slug===row.slug))fail('slug collision in '+table);
   inserts[table].push(row);
  }
 };
 for(const id of [...creatorIds].sort()){
  const c=s.creators.find(r=>r.id===id);if(!c)fail('missing credited creator');
  if(c.has_owner||c.has_verified_x||c.owner_user_id||c.x_provider_id||c.record_origin==='user'||c.record_origin==='development')fail('account ownership requires an approved subplan');
  const existing=d.creators.find(r=>r.id===id);
  if(existing?.has_owner||existing?.has_verified_x)fail('destination identity is owned');
  const identity=xIdentity(c);
  if(identity&&d.creators.some(r=>r.id!==id&&xIdentity(r)===identity))fail('unapproved duplicate X identity');
  const username=c.username;
  if(typeof username!=='string'||!validateCreatorUsername(username).ok)fail('invalid selected creator username');
  if(d.creators.some(r=>r.id!==id&&String(r.username??'').toLowerCase()===String(username).toLowerCase())||d.creator_username_aliases.some(r=>r.creator_id!==id&&String(r.username).toLowerCase()===String(username).toLowerCase()))fail('creator route collision');
  if(existing){
   if(existing.username&&existing.username!==username)fail('existing creator route differs');
   if(!existing.username){if(id!==D1.survivor)fail('unapproved existing creator profile mapping');profileUpdates.push({id:String(id),username:username as string});}
  }else add('creators',{...c,record_origin:'editorial'},true);
  const aliases=s.creator_username_aliases.filter(r=>r.creator_id===id);
  if(aliases.filter(r=>r.is_current&&r.username===username).length!==1||aliases.filter(r=>r.is_current).length!==1)fail('selected current alias mismatch');
  for(const alias of aliases){
   const match=d.creator_username_aliases.find(r=>String(r.username).toLowerCase()===String(alias.username).toLowerCase());
   if(match){if(match.creator_id!==id||match.is_current!==alias.is_current)fail('alias collision');}
   else add('creator_username_aliases',alias);
  }
 }
 for(const logo of logos){if(!s.logo_media.some(r=>r.logo_id===logo.id))fail('missing logo media');add('logos',logo);}
 for(const website of websites){if(!s.website_media.some(r=>r.website_id===website.id)||!s.website_sections.some(r=>r.website_id===website.id))fail('missing website presentation');add('websites',website);}
 for(const row of s.logo_media.filter(r=>logoIds.has(r.logo_id)))add('logo_media',row,true);
 for(const table of ['website_media','website_sections'])for(const row of s[table].filter(r=>websiteIds.has(r.website_id)))add(table,row,true);
 return {inserts,profileUpdates,mediaKeys:[...mediaKeys].sort(),selectedCreatorIds:[...creatorIds].map(String).sort(),selectedWorkIds:[...logoIds,...websiteIds].map(String).sort()};
}
