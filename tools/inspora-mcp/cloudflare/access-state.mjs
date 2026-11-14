import {searchSchema,CURSOR_TTL_MS} from '../search.mjs';
import {stable} from '../enrichment.mjs';
const queryFields=['query','reference_url','kinds','filters','required_terms','exclude_terms','exclude_ids'];
const fail=(status,error)=>Response.json({error},{status});

// One object per authenticated principal. There is no global search serialization.
export class AccessState {
  constructor(state){this.state=state;}
  async fetch(request) {
    const {action,...input}=await request.json(),now=Date.now();
    if(action==='budget')return this.state.storage.transaction(async storage=>{
      const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
      const current=await storage.get('budget')??{};
      const next={minute,day,minuteCount:current.minute===minute?current.minuteCount+1:1,dayCount:current.day===day?current.dayCount+1:1};
      if(next.minuteCount>30||next.dayCount>500)return fail(429,'RATE_LIMITED');
      await storage.put('budget',next);return Response.json({ok:true});
    });
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
        if(!value||value.expires<=now||value.snapshotId!==input.snapshotId){await storage.delete(key);return fail(409,'CURSOR_EXPIRED');}
        for(const field of queryFields)if(args[field]!==undefined&&stable(args[field])!==stable(value.query[field]))return fail(409,'CURSOR_QUERY_MISMATCH');
        await storage.delete(key);return Response.json(value);
      });
    }
    return fail(400,'INVALID_ACTION');
  }
  async alarm(){const now=Date.now();for(const [key,value] of await this.state.storage.list({prefix:'cursor:'}))if(value.expires<=now)await this.state.storage.delete(key);}
}

export function accessStore(binding,principal) {
  const object=binding.get(binding.idFromName(principal));
  return async(action,input={})=>{
    const response=await object.fetch('https://state.internal/',{method:'POST',body:JSON.stringify({action,...input})});
    const body=await response.json();if(!response.ok)throw Error(body.error);return body;
  };
}
