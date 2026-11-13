import {createHash,timingSafeEqual} from 'node:crypto';
import {feedSchema} from './feed-schema.mjs';
import {eligible} from './catalog.mjs';
import {parseEnrichment} from './enrichment.mjs';

export const CATALOG_HOST='www.inspora.design';
export const CATALOG_PATH='/api/inspora/catalog';
export const ENRICHMENT_KEY='mcp/phase1/enrichment-v1.json';
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive'};
const hash=value=>createHash('sha256').update(value).digest();

// Authenticate before touching the database/storage. No arbitrary source, path or query.
export function createHostedFeed({capture,readEnrichment,token,now=()=>Date.now()}) {
  return async function serve(request) {
    const url=new URL(request.url);
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(url.hostname!==CATALOG_HOST||url.pathname!==CATALOG_PATH||url.search||request.method!=='GET')return reply(404,{error:'Not found'});
    if(!/^[a-zA-Z0-9_-]{32,128}$/.test(token??''))return reply(503,{error:'Catalog unavailable'});
    const authorization=request.headers.get('authorization')??'';
    if(authorization.length>256||!timingSafeEqual(hash(authorization),hash('Bearer '+token)))return reply(401,{error:'Catalog access required'});
    try {
      const [catalog,rawNotes]=await Promise.all([capture(),readEnrichment()]);
      const at=Date.parse(catalog.capturedAt);
      if(!Number.isFinite(at)||now()-at>180000||at>now()+60000)throw Error('Invalid capture age');
      const rows=catalog.rows.filter(row=>eligible(row,at)),ids=new Set(rows.map(row=>row.id));
      if(ids.size!==rows.length)throw Error('Duplicate work IDs');
      // Exclude removed/unpublished works even from the raw notes manifest.
      const enrichment={version:1,entries:parseEnrichment(rawNotes).entries.filter(entry=>ids.has(entry.id))};
      const body=JSON.stringify(feedSchema.parse({version:1,catalog:{capturedAt:catalog.capturedAt,rows},enrichment}));
      if(Buffer.byteLength(body)>4*1024*1024)throw Error('Catalog exceeds hosted response budget');
      return new Response(body,{headers});
    } catch {
      // Database details, object keys and credentials must not reach responses/logs.
      return reply(503,{error:'Catalog unavailable; retry later'});
    }
  };
}
