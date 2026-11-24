import {createHash} from 'node:crypto';
import {searchSchema,CURSOR_TTL_MS,queryFields,SEARCH_REVISION} from '../search.mjs';
import {stable} from '../enrichment.mjs';
import {clean} from '../catalog.mjs';
const fail=(status,error)=>Response.json({error},{status});
// HTTP abuse ceilings count every MCP request. Tool calls have their own per-person
// budget, so protocol traffic (initialize, notifications, tools/list, ping) never spends it.
export const HTTP_LIMITS={minute:30,day:500};
export const PRO_HTTP_LIMITS={minute:60,day:1000};
export const TEAM_HTTP_LIMITS=PRO_HTTP_LIMITS;
export const TOOL_LIMITS={minute:30,day:500};
// Fair use: fresh searches per account per calendar month (UTC). Continuation pages,
// work details and status do not count. This stops one account being shared by a group.
export const SEARCH_LIMITS={month:3000};
// Active Pro is re-checked at most this often per account; a cancellation applies within it.
export const ACCESS_CACHE_MS=60000;
const monthKey=now=>new Date(now).toISOString().slice(0,7);
const nextMonth=now=>{const d=new Date(now);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);};
export const CURSOR_MAX_ENTRIES=128,CURSOR_MAX_CHARS=512000,CONTINUATION_MAX_WORKS=1000;

// Continuation stores only what later pages need: the next ranked ids with deduplicated
// labels (match, reason as displayed, any other per-item field), capped so a broad match
// can never exceed the storage bound.
export function packContinuation(state,cap=CONTINUATION_MAX_WORKS){
  const {ranked,offset,...rest}=state,items=ranked.slice(offset,offset+cap),labels=[],seen=new Map();
  const entries=items.map(({id,...label})=>{
    if(label.reason!==undefined)label.reason=clean(label.reason,220);
    const key=stable(label);
    if(!seen.has(key)){seen.set(key,labels.length);labels.push(label);}
    return [id,seen.get(key)];
  });
  return {...rest,limited:Boolean(state.limited)||offset+cap<ranked.length,labels,entries};
}
export function unpackContinuation({labels,entries,...rest}){
  return {...rest,offset:0,ranked:entries.map(([id,label])=>({id,...labels[label]}))};
}
// Re-reading a cursor with the same page settings yields the same page and the same next
// cursor. Derived from the secret, principal-bound cursor, so it stays unguessable.
export const continuationCursor=(cursor,args)=>createHash('sha256').update(cursor+'\0'+stable([args.count,args.format,args.include_reason])).digest('base64url').slice(0,32);
// At the cap, evict the live entries that expire first.
async function evictFor(storage,prefix,max,now){
  const live=[];
  for(const [key,value] of await storage.list({prefix}))if(value.expires<=now)await storage.delete(key);else live.push([key,value.expires]);
  live.sort((a,b)=>a[1]-b[1]);
  for(const [key] of live.slice(0,Math.max(0,live.length-max+1)))await storage.delete(key);
}
const exceeded=(next,limits,minute,day,now)=>next.dayCount>limits.day?{window:'day',limit:limits.day,retry_after:Math.ceil(((day+1)*86400000-now)/1000)}:
  next.minuteCount>limits.minute?{window:'minute',limit:limits.minute,retry_after:Math.ceil(((minute+1)*60000-now)/1000)}:null;

// One object per authenticated principal. There is no global search serialization.
export class AccessState {
  constructor(state){this.state=state;}
  async fetch(request) {
    const {action,...input}=await request.json(),now=Date.now();
    if(action==='budget')return this.state.storage.transaction(async storage=>{
      const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
      const current=await storage.get('budget')??{};
      const next={minute,day,minuteCount:current.minute===minute?current.minuteCount+1:1,dayCount:current.day===day?current.dayCount+1:1};
      // HTTP-level abuse bound (all MCP requests, including protocol traffic).
      const paidUntil=await storage.get('paid_http_until');
      const limited=exceeded(next,paidUntil>now||input.team===true?PRO_HTTP_LIMITS:HTTP_LIMITS,minute,day,now);
      if(limited)return Response.json({error:'RATE_LIMITED',...limited},{status:429});
      await storage.put('budget',next);return Response.json({ok:true});
    });
    // This short cache affects only the HTTP abuse ceiling, never entitlement.
    if(action==='budget_class'){
      if(input.pro===true){
        if((await this.state.storage.get('paid_http_until')??0)<now+60000)await this.state.storage.put('paid_http_until',now+5*60000);
      }else await this.state.storage.delete('paid_http_until');
      return Response.json({ok:true});
    }
    // Per-person tool-call limits across all clients of one account. A refused call is not recorded.
    if(action==='tools')return this.state.storage.transaction(async storage=>{
      const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
      const current=await storage.get('tools')??{};
      const next={minute,day,minuteCount:current.minute===minute?current.minuteCount+1:1,dayCount:current.day===day?current.dayCount+1:1};
      const limited=exceeded(next,TOOL_LIMITS,minute,day,now);
      if(limited)return Response.json({ok:false,...limited});
      await storage.put('tools',next);return Response.json({ok:true});
    });
    // Fair-use monthly search count. A refused search is not recorded.
    if(action==='search')return this.state.storage.transaction(async storage=>{
      const month=monthKey(now),current=await storage.get('searches'),count=(current?.month===month?current.count:0)+1;
      if(count>SEARCH_LIMITS.month)return Response.json({ok:false,limit:SEARCH_LIMITS.month,retry_after:Math.ceil((nextMonth(now)-now)/1000),resets_at:new Date(nextMonth(now)).toISOString()});
      await storage.put('searches',{month,count});return Response.json({ok:true});
    });
    if(action==='usage'){
      const current=await this.state.storage.get('searches');
      return Response.json({searches_this_month:current?.month===monthKey(now)?current.count:0,monthly_search_limit:SEARCH_LIMITS.month,resets_at:new Date(nextMonth(now)).toISOString()});
    }
    // Short cache of an active Pro answer only; any other answer clears it.
    if(action==='access_get'){
      const value=await this.state.storage.get('pro_access');
      return Response.json(value&&value.until>now?{value:value.access}:{value:null});
    }
    if(action==='access_put'){
      if(input.access?.access==='pro')await this.state.storage.put('pro_access',{until:now+ACCESS_CACHE_MS,access:{access:'pro',manage_url:String(input.access.manage_url??'')}});
      else await this.state.storage.delete('pro_access');
      return Response.json({ok:true});
    }
    if(action==='put'){
      const value=input.value;
      if(!/^[A-Za-z0-9_-]{32}$/.test(input.cursor)||!Array.isArray(value?.entries)||!Array.isArray(value.labels)||JSON.stringify(value).length>CURSOR_MAX_CHARS)return fail(400,'CURSOR_INVALID');
      if(value.expires<=now||value.expires>now+CURSOR_TTL_MS)return fail(400,'CURSOR_INVALID');
      await this.state.storage.transaction(async storage=>{
        if(!await storage.get('cursor:'+input.cursor))await evictFor(storage,'cursor:',CURSOR_MAX_ENTRIES,now);
        await storage.put('cursor:'+input.cursor,value);
        await storage.setAlarm(now+CURSOR_TTL_MS);
      });
      return Response.json({ok:true});
    }
    if(action==='take'){
      const args=searchSchema.parse(input.args);
      // Reading does not consume the cursor: within its TTL it returns the same page again.
      return this.state.storage.transaction(async storage=>{
        const key='cursor:'+args.cursor,value=await storage.get(key);
        if(!value||!Array.isArray(value.entries)||value.searchRevision!==SEARCH_REVISION||value.expires<=now||value.snapshotId!==input.snapshotId){await storage.delete(key);return fail(409,'CURSOR_EXPIRED');}
        for(const field of queryFields)if(args[field]!==undefined&&stable(args[field])!==stable(value.query[field]))return fail(409,'CURSOR_QUERY_MISMATCH');
        return Response.json(value);
      });
    }
    return fail(400,'INVALID_ACTION');
  }
  async alarm(){const now=Date.now();for(const prefix of ['cursor:','receipt:'])for(const [key,value] of await this.state.storage.list({prefix}))if(value.expires<=now)await this.state.storage.delete(key);}
}

export function accessStore(binding,principal) {
  const object=binding.get(binding.idFromName(principal));
  return async(action,input={})=>{
    const response=await object.fetch('https://state.internal/',{method:'POST',body:JSON.stringify({action,...input})});
    const body=await response.json();
    if(!response.ok)throw Object.assign(Error(body.error),{retryAfter:body.retry_after,window:body.window,limit:body.limit});
    return body;
  };
}
