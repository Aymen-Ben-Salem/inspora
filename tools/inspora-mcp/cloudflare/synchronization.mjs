import {feedSchema} from '../feed-schema.mjs';
import {createEmbed} from './embeddings.mjs';
import {buildCatalog,publishCatalog,safeInterim,POINTER_KEY,FENCE_KEY,REPAIR_INTERVAL_MS} from './catalog.mjs';
import {requestCatalog} from './source-request.mjs';
import {pruneIndexes} from './retention.mjs';
import {enqueueVisualJobs,recordVisualResult} from './visual-jobs.mjs';

export const COALESCE_MS=5000;
// While a known edit fences reads, failed refreshes retry at least this often.
export const PENDING_RETRY_MS=60000;
export async function sourceFeed(env) {
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(env.CATALOG_SOURCE_TOKEN??''))throw Error('SOURCE_NOT_CONFIGURED');
  const response=await requestCatalog(env.CATALOG_SOURCE_TOKEN);
  if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
  // The source independently enforces a 4 MiB bound.
  const raw=await response.text();if(new TextEncoder().encode(raw).length>4*1024*1024)throw Error('SOURCE_TOO_LARGE');
  return feedSchema.parse(JSON.parse(raw));
}

// Only publishing is serialized globally. Retrieval stays in independent Workers.
export class CatalogSync {
  constructor(state,env,{readSource=sourceFeed,embed=createEmbed(env.AI)}={}){this.state=state;this.env=env;this.readSource=readSource;this.embed=embed;}
  async fetch(request){
    const input=await request.json();
    if(input.action==='status'){
      // Maintainer-only (sync token): includes the last visual-pack scheduling summary when enabled.
      const status=await this.state.storage.get('status')??{state:'not_started'},visuals=await this.state.storage.get('visuals');
      return Response.json(visuals?{...status,visuals}:status);
    }
    if(input.action==='visual-result'){
      try{await recordVisualResult(this.state.storage,{workId:input.workId,mediaFingerprint:input.mediaFingerprint,state:input.state,...(input.reason?{reason:input.reason}:{})});}
      catch{return Response.json({error:'INVALID_RESULT'},{status:400});}
      return Response.json({recorded:true});
    }
    if(input.action!=='enqueue')return Response.json({error:'INVALID_ACTION'},{status:400});
    await this.state.blockConcurrencyWhile(async()=>{
      const sequence=(await this.state.storage.get('sequence')??0)+1;
      await this.state.storage.put('sequence',sequence);
      // A known edit blocks reads until current eligibility/metadata is captured.
      // The notification names no works, so nothing from the previous snapshot is safe to serve.
      if(input.reason!=='repair'){
        const since=await this.state.storage.get('pendingSince')??new Date().toISOString();
        await this.state.storage.put('pendingSince',since);
        await this.env.CATALOG.put(FENCE_KEY,JSON.stringify({pending:true,sequence,since}));
      }
      const alarm=await this.state.storage.getAlarm();
      if(alarm===null||alarm>Date.now()+COALESCE_MS)await this.state.storage.setAlarm(Date.now()+COALESCE_MS);
    });
    return Response.json({accepted:true},{status:202});
  }
  async alarm(){
    const sequence=await this.state.storage.get('sequence')??0;
    let stage='source';
    try{
      await this.state.storage.put('status',{state:'refreshing',lastAttemptAt:new Date().toISOString()});
      const feed=await this.readSource(this.env),pointerObject=await this.env.CATALOG.get(POINTER_KEY);
      stage='cache';let previous;
      if(pointerObject){const pointer=await pointerObject.json(),object=await this.env.CATALOG.get(pointer.objectKey);if(object)previous=await object.json();}
      stage='normalize';const interim=safeInterim(feed,previous);
      // The short gate protects commit ordering against an edit arriving mid-build.
      // Only a build whose source read began after the latest edit lifts the fence.
      const publish=async(index,{always=false}={})=>this.state.blockConcurrencyWhile(async()=>{
        const current=sequence===(await this.state.storage.get('sequence')??0);
        if(!current&&!always)return false;
        await publishCatalog(this.env.CATALOG,index,{eventDriven:true});
        if(current){
          await this.env.CATALOG.put(FENCE_KEY,JSON.stringify({pending:false,sequence,snapshotId:index.snapshotId}));
          await this.state.storage.delete('pendingSince');
        }
        return current;
      });
      stage='interim';if(!await publish(interim))return;
      stage='embedding';const index=await buildCatalog(feed,{previous,embed:this.embed});
      // Keep new vectors even when a newer edit arrived: the fence stays pending and the
      // next run reuses them instead of restarting the embedding work.
      stage='commit';if(!await publish(index,{always:true}))return;
      await this.state.storage.put('status',{state:'ready',lastSuccessAt:feed.catalog.capturedAt,works:index.rows.length,pendingWorks:0,repairIntervalHours:12});
      await this.state.storage.put('failures',0);
      // Queue visual packs for new or changed media. Never part of the refresh's outcome.
      if(this.env.VISUAL_QUEUE){
        try{await this.state.storage.put('visuals',await enqueueVisualJobs({bucket:this.env.CATALOG,queue:this.env.VISUAL_QUEUE,storage:this.state.storage,rows:index.rows}));}
        catch{await this.state.storage.put('visuals',{state:'failed',checkedAt:new Date().toISOString()}).catch(()=>{});}
      }
      if((await this.state.storage.get('pruneAt')??0)<=Date.now()){
        try{
          const cursor=await pruneIndexes(this.env.CATALOG,`mcp/hosted/v1/indexes/${index.snapshotId}.json`,await this.state.storage.get('pruneCursor'));
          await this.state.storage.put('pruneCursor',cursor);
          await this.state.storage.put('pruneAt',Date.now()+REPAIR_INTERVAL_MS);
        }catch{ /* Retention failure must not invalidate a successful catalog refresh. */ }
      }
    }catch(error){
      const failures=(await this.state.storage.get('failures')??0)+1;
      await this.state.storage.put('failures',failures);
      const errorCode=/^[A-Z_0-9]+$/.test(error.message??'')?error.message:'REFRESH_FAILED';
      await this.state.storage.put('status',{state:'retrying',lastFailureAt:new Date().toISOString(),failures,errorCode,stage,errorName:['Error','TypeError','SyntaxError','ZodError'].includes(error.name)?error.name:'Error'});
      // A pending edit keeps reads fenced, so retry it quickly rather than with the long backoff.
      const pending=await this.state.storage.get('pendingSince');
      const retryAt=Date.now()+Math.min(pending?PENDING_RETRY_MS:REPAIR_INTERVAL_MS,30000*2**Math.min(failures-1,10));
      await this.state.storage.setAlarm(retryAt);
      if(pending)await this.state.blockConcurrencyWhile(async()=>{
        const fence=await this.env.CATALOG.get(FENCE_KEY),value=fence?await fence.json():null;
        if(value?.pending)await this.env.CATALOG.put(FENCE_KEY,JSON.stringify({...value,retryAt:new Date(retryAt).toISOString()}));
      }).catch(()=>{});
    }finally{
      // Preserve a newer notification's alarm. Otherwise schedule the shared repair.
      const next=await this.state.storage.getAlarm();
      if(next===null)await this.state.storage.setAlarm(Date.now()+REPAIR_INTERVAL_MS);
    }
  }
}

export function coordinator(env){return env.CATALOG_SYNC.get(env.CATALOG_SYNC.idFromName('catalog-publisher-v1'));}
