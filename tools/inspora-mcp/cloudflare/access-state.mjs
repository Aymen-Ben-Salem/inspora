import {searchSchema,CURSOR_TTL_MS,queryFields,SEARCH_REVISION} from '../search.mjs';
import {stable} from '../enrichment.mjs';
const fail=(status,error)=>Response.json({error},{status});
export const HTTP_LIMITS={minute:30,day:500};
export const PRO_HTTP_LIMITS={minute:60,day:1000};
export const TOOL_LIMITS={minute:30,day:500};
export const RECEIPT_TTL_MS=10*60000,RECEIPT_MAX_ENTRIES=32,RECEIPT_MAX_CHARS=64000;

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
      const limits=paidUntil>now?PRO_HTTP_LIMITS:HTTP_LIMITS;
      if(next.minuteCount>limits.minute||next.dayCount>limits.day){
        const reset=next.dayCount>limits.day?(day+1)*86400000:(minute+1)*60000;
        return Response.json({error:'RATE_LIMITED',retry_after:Math.ceil((reset-now)/1000)},{status:429});
      }
      await storage.put('budget',next);return Response.json({ok:true});
    });
    // This short cache affects only the HTTP abuse ceiling, never entitlement.
    if(action==='budget_class'){
      if(input.pro===true){
        if((await this.state.storage.get('paid_http_until')??0)<now+60000)await this.state.storage.put('paid_http_until',now+5*60000);
      }else await this.state.storage.delete('paid_http_until');
      return Response.json({ok:true});
    }
    // Customer tool-call limits across all clients of one account, including zero-credit calls.
    // A refused call is not recorded and never reaches accounting, so it consumes no credits.
    if(action==='tools')return this.state.storage.transaction(async storage=>{
      const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
      const current=await storage.get('tools')??{};
      const next={minute,day,minuteCount:current.minute===minute?current.minuteCount+1:1,dayCount:current.day===day?current.dayCount+1:1};
      if(next.dayCount>TOOL_LIMITS.day)return Response.json({ok:false,retry_after:Math.ceil(((day+1)*86400000-now)/1000)});
      if(next.minuteCount>TOOL_LIMITS.minute)return Response.json({ok:false,retry_after:Math.ceil(((minute+1)*60000-now)/1000)});
      await storage.put('tools',next);return Response.json({ok:true});
    });
    // Replay receipts let a retried operation return its original result without a second charge.
    if(action==='receipt_get'){
      if(!/^[A-Za-z0-9_-]{43}$/.test(input.key))return fail(400,'RECEIPT_INVALID');
      const value=await this.state.storage.get('receipt:'+input.key);
      return Response.json(value&&value.expires>now?{value:value.result,pending:value.pending===true}:{value:null});
    }
    if(action==='receipt_put'){
      if(!/^[A-Za-z0-9_-]{43}$/.test(input.key)||JSON.stringify(input.result??null).length>RECEIPT_MAX_CHARS)return fail(400,'RECEIPT_INVALID');
      await this.state.storage.transaction(async storage=>{
        const entries=await storage.list({prefix:'receipt:'});
        for(const [key,value] of entries)if(value.expires<=now)await storage.delete(key);
        if(entries.size>=RECEIPT_MAX_ENTRIES)await storage.delete(entries.keys().next().value);
        await storage.put('receipt:'+input.key,{expires:now+RECEIPT_TTL_MS,result:input.result,pending:input.pending===true});
        await storage.setAlarm(now+RECEIPT_TTL_MS);
      });
      return Response.json({ok:true});
    }
    if(action==='put'){
      if(!/^[A-Za-z0-9_-]{32}$/.test(input.cursor)||JSON.stringify(input.value).length>512000)return fail(400,'CURSOR_INVALID');
      const value=input.value;
      if(value.expires<=now||value.expires>now+CURSOR_TTL_MS)return fail(400,'CURSOR_INVALID');
      await this.state.storage.transaction(async storage=>{
        const entries=await storage.list({prefix:'cursor:'});
        for(const [key,value] of entries)if(value.expires<=now)await storage.delete(key);
        if(entries.size>=128)await storage.delete(entries.keys().next().value);
        await storage.put('cursor:'+input.cursor,value);
        await storage.setAlarm(now+CURSOR_TTL_MS);
      });
      return Response.json({ok:true});
    }
    if(action==='take'){
      const args=searchSchema.parse(input.args);
      return this.state.storage.transaction(async storage=>{
        const key='cursor:'+args.cursor,value=await storage.get(key);
        if(!value||value.searchRevision!==SEARCH_REVISION||value.expires<=now||value.snapshotId!==input.snapshotId){await storage.delete(key);return fail(409,'CURSOR_EXPIRED');}
        if(value.consumed)return fail(409,'CURSOR_USED: this continuation was already used; use the latest returned cursor');
        for(const field of queryFields)if(args[field]!==undefined&&stable(args[field])!==stable(value.query[field]))return fail(409,'CURSOR_QUERY_MISMATCH');
        await storage.put(key,{consumed:true,expires:value.expires,searchRevision:value.searchRevision,snapshotId:value.snapshotId});
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
    if(!response.ok)throw Object.assign(Error(body.error),{retryAfter:body.retry_after});
    return body;
  };
}
