import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {z} from 'zod';
import {sha} from '../catalog.mjs';
import {SearchEngine,searchSchema,detailSchema,batchDetailSchema,CURSOR_TTL_MS,SEARCH_REVISION,DEFAULT_COUNT} from '../search.mjs';
import {createEmbed} from './embeddings.mjs';
import {createCatalogReader} from './catalog.mjs';
import {accessStore,packContinuation,unpackContinuation,continuationCursor,CONTINUATION_MAX_WORKS,TOOL_LIMITS} from './access-state.mjs';
import {coordinator} from './synchronization.mjs';
import {hostedVisuals} from './previews.mjs';
import {workReply,detailTools,VISUAL_RESPONSE_BYTES} from '../visuals.mjs';
import {searchInstructions} from '../instructions.mjs';
import {searchTool,catalogStatusTool} from '../tool-definitions.mjs';
import {createAccounting,operationKey,accessError,accountView,newAccountingSession,validAccountingSession} from './pro-accounting.mjs';
export {AccessState} from './access-state.mjs';
export {CatalogSync} from './synchronization.mjs';

const readCatalog=createCatalogReader();
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false};
const data=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const responseHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive'};
const fail=(status,error)=>Response.json({error},{status,headers:responseHeaders});
const knownError=/^(?:PRO_REQUIRED|PAYMENT_REVIEW|CREDITS_EXHAUSTED|OPERATION_IN_PROGRESS|TOOL_LIMIT_REACHED|ACCOUNTING_UNAVAILABLE|CURSOR_[A-Z_]+|CATALOG_[A-Z_]+|EMBEDDING_INVALID|RATE_LIMITED|INPUT|QUERY_REWRITE_REQUIRED|CONSTRAINT_CONFLICT|INVALID_REFERENCE|REFERENCE_NOT_ELIGIBLE|WORK_NOT_ELIGIBLE|RESPONSE_BUDGET|DETAIL_BUDGET)(?::[^\r\n]*)?$/;
const fixInput='Fix the arguments to match the tool schema and retry.';
// Bare hosted codes gain an explanation and the next step, keeping the CODE prefix.
const nextSteps={
  CURSOR_EXPIRED:'This continuation expired (15 minutes after the original search), belongs to another connection, or the catalog changed. Rerun the original search; add exclude_ids for works already shown.',
  CURSOR_INVALID:'The continuation could not be saved or read. Rerun the search; if it recurs, narrow it with kinds, subjects or filters.',
  CURSOR_QUERY_MISMATCH:'Send the cursor alone or with unchanged constraints; start a new search for changed constraints.',
  CATALOG_UPDATING:seconds=>`A catalog edit is being applied; search and details pause until it is captured so removed works never appear. Retry in ~${seconds} seconds; catalog_status reports progress.`,
  CATALOG_STALE:'Catalog synchronization is overdue, so search and details are paused rather than risk outdated eligibility. Retry later and tell the Inspora team if it persists; catalog_status shows the last verified time.',
  CATALOG_UNAVAILABLE:'The catalog cannot be read right now. Retry in about a minute; tell the Inspora team if it persists.',
  CATALOG_INTEGRITY:'The current catalog snapshot failed its integrity check and was not used. Retry later and tell the Inspora team.',
  CATALOG_MODEL_MISMATCH:'The current catalog snapshot does not match the search model and was not used. Retry later and tell the Inspora team.',
  RESPONSE_BUDGET:'The page exceeded the response bound. Retry with a smaller count, format=links or include_reason=false.',
  DETAIL_BUDGET:'These work details exceed the response bound. Retry with preview=link or preview=none.',
};
const issues=error=>error.issues.slice(0,3).map(issue=>(issue.path.join('.')||'arguments')+': '+issue.message).join('; ').slice(0,240);
export function toolError(error){
  if(error instanceof z.ZodError)return `INVALID_INPUT: ${issues(error)}. ${fixInput}`;
  const message=String(error?.message??''),code=message.match(/^[A-Z_]+/)?.[0],step=nextSteps[code];
  if(step)return code+': '+(typeof step==='function'?step(error.retryAfter??30):step);
  return knownError.test(message)?message.slice(0,400):'SERVICE_UNAVAILABLE: retry later';
}
const errorResult=(error,message=toolError(error))=>({isError:true,...data({error:message,
  ...(Number.isInteger(error?.retryAfter)?{retry_after:error.retryAfter}:{}),...(error?.window?{limit_window:error.window}:{})})});

// Optional Worker-side team allowlist, checked on every authenticated request.
// Unset or blank keeps the current behaviour; a malformed list fails closed (null).
export function teamMember(user,env){
  const raw=String(env.TEAM_USER_IDS??'').trim();
  if(!raw)return true;
  const ids=raw.split(',').map(id=>id.trim()).filter(Boolean);
  if(!ids.length||ids.some(id=>!/^[A-Za-z0-9_-]{1,120}$/.test(id)))return null;
  return ids.includes(user);
}

// A refused tools/call stays a tool result the model can read; other traffic gets HTTP 429.
function rateLimited(body,error){
  const retryAfter=Number.isInteger(error.retryAfter)&&error.retryAfter>0?error.retryAfter:60,window=error.window==='day'?'day':'minute';
  const value={error:`RATE_LIMITED: retry after ${retryAfter} seconds. The per-person ${window} request ceiling, shared by all your connected clients, applies.`,retry_after:retryAfter,limit_window:window};
  if(body?.method==='tools/call'&&body.id!==undefined&&body.id!==null)return Response.json({jsonrpc:'2.0',id:body.id,result:{isError:true,...data(value)}},{headers:responseHeaders});
  return Response.json(value,{status:429,headers:{...responseHeaders,'Retry-After':String(retryAfter)}});
}

// Loose output schemas: stable fields only, so ranking additions never break validation.
const searchOutput=z.looseObject({
  snapshot:z.looseObject({captured_at:z.string(),live:z.boolean()}),
  interpreted_query:z.looseObject({}).describe('How the request was interpreted: kinds, subjects, scope, filters, corrections, subject_fallbacks, brief_terms, related_context_labels, kind_note and derived_constraints (text cues rank; only enforced inferred kinds filter).'),
  search_coverage:z.looseObject({catalog_works:z.number(),matching_works:z.number()}).describe('Evidence counts across the search: subject_matches or brief_matches (these set insufficient_matches), weaker_subject_matches, context_matches, context_related, style_matches.'),
  results:z.array(z.looseObject({match:z.string().optional().describe('Strongest evidence tier, not a fit verdict: subject, contains, broader, related, similar, brief or browse. evidence lists how the subject, context, style and brief terms are shown; decide direct versus adaptation from it and the previews.'),id:z.string(),url:z.string().nullable().optional(),title:z.string().nullable().optional(),creator:z.string().nullable().optional()})),
  next_cursor:z.string().nullable().describe('Continue with this cursor for more results; null when exhausted.'),
  exhausted:z.boolean(),
  insufficient_matches:z.boolean(),
  notice:z.string(),
});
const statusOutput=z.looseObject({
  search_revision:z.number(),
  catalog_state:z.enum(['ready','updating','stale','unavailable']).describe('ready: search works. updating: retry after retry_after_seconds. stale/unavailable: search is paused.'),
  retry_after_seconds:z.number().optional(),
  captured_at:z.string().optional(),
  counts:z.record(z.string(),z.number()).optional(),
  limits:z.looseObject({}).optional(),
});

export async function boundedBody(request) {
  if(Number(request.headers.get('content-length'))>16384)throw Error('BODY_TOO_LARGE');
  if(!request.body)return '';
  const reader=request.body.getReader(),parts=[];let size=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('BODY_TOO_LARGE');}parts.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new TextDecoder().decode(bytes);
}

function principal(request,env) {
  // Temporary team trial only. Public OAuth onboarding remains a release gate.
  if(env.ACCESS_MODE!=='pilot')return null;
  const header=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header))return null;
  let entries;try{entries=JSON.parse(env.MCP_PILOT_TOKENS);}catch{return null;}
  if(!Array.isArray(entries))return null;
  const digest=sha(header.slice(7)),now=Date.now();
  const entry=entries.find(entry=>entry.sha256===digest&&/^[A-Za-z0-9_-]{1,80}$/.test(entry.id)&&Date.parse(entry.expiresAt)>now);
  return entry?.id??null;
}

export const ENGINE_TTL_MS=10*60*1000;
export function createWorker({catalog=readCatalog,embedding=createEmbed,authenticate=principal,accountingFetch=fetch}={}) {
  // One search engine per Worker isolate and catalog snapshot: building it (document
  // preparation for every work) costs most of a request's CPU budget, so it is reused across
  // requests and rebuilt when the snapshot changes or after ENGINE_TTL_MS (time-based eligibility).
  let shared=null;
  const sharedEngine=(current,env)=>{
    if(!shared||shared.engine.index.snapshotId!==current.snapshotId||Date.now()-shared.at>ENGINE_TTL_MS)shared={engine:new SearchEngine(current,{embed:embedding(env.AI)}),at:Date.now()};
    // Same rows; the capture time and delivery state come from the current pointer read.
    else shared.engine.index=current;
    return shared.engine;
  };
  return {async fetch(request,env,ctx) {
    const url=new URL(request.url);
    // Exact configured origin; never derive trust from arbitrary Host/Origin values.
    if(!env.MCP_ORIGIN||url.origin!==env.MCP_ORIGIN||url.search)return fail(404,'Not found');
    if(url.pathname==='/internal/catalog'){
      if(!/^[A-Za-z0-9_-]{43,128}$/.test(env.MCP_SYNC_TOKEN??'')||sha(request.headers.get('authorization')??'')!==sha('Bearer '+env.MCP_SYNC_TOKEN))return fail(401,'Access required');
      try{
        if(request.method==='GET')return coordinator(env).fetch('https://sync.internal/',{method:'POST',body:JSON.stringify({action:'status'})});
        if(request.method==='POST')return coordinator(env).fetch('https://sync.internal/',{method:'POST',body:JSON.stringify({action:'enqueue',reason:'edit'})});
      }catch{return fail(503,'Catalog refresh unavailable');}
      return fail(405,'Method not allowed');
    }
    if(url.pathname!=='/mcp')return fail(404,'Not found');
    const origin=request.headers.get('origin');
    if(origin&&origin!==env.MCP_ORIGIN)return fail(403,'Origin rejected');
    const user=authenticate(request,env,ctx);
    if(!user)return fail(401,'MCP access required');
    const member=teamMember(user,env);
    if(member===null)return fail(503,'MCP temporarily unavailable');
    if(!member)return fail(403,'TEAM_ACCESS_REQUIRED: this Inspora account is not on the current team-trial list. Ask the Inspora team to add it; signing in again will not change this.');
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...responseHeaders,Allow:'POST'}});
    try {
      const raw=await boundedBody(request);
      let body;try{body=JSON.parse(raw);}catch{return fail(400,'Invalid JSON');}
      // Customer (pro) policy fails closed unless the shared Pro accounting boundary is configured.
      let accounting;try{accounting=env.MCP_ACCESS_POLICY==='pro'?createAccounting(env,accountingFetch):null;}catch{return fail(503,'MCP temporarily unavailable');}
      if(env.MCP_ACCESS_POLICY==='pro'&&!accounting)return fail(503,'MCP temporarily unavailable');
      if(env.MCP_ACCESS_POLICY!==undefined&&!['team','pro'].includes(env.MCP_ACCESS_POLICY))return fail(503,'MCP temporarily unavailable');
      let sessionId;
      if(accounting){
        if(body?.method==='initialize')sessionId=newAccountingSession(user,env.PRO_ACCOUNTING_TOKEN);
        else{
          sessionId=request.headers.get('mcp-session-id');
          if(!validAccountingSession(sessionId,user,env.PRO_ACCOUNTING_TOKEN))return fail(sessionId?404:400,'MCP session required; reconnect your client');
        }
      }
      const state=accessStore(env.ACCESS_STATE,user);
      // Every request counts toward an HTTP abuse ceiling. The team trial uses the paid
      // ceiling because protocol traffic must not spend its separate per-person tool budget.
      try{await state('budget',{team:!accounting});}catch(error){if(error.message==='RATE_LIMITED')return rateLimited(body,error);throw error;}
      // Limits and identity are validated before entitlement, credit or search work.
      const toolLimit=async()=>{
        const limit=await state('tools');
        if(!limit.ok)throw Object.assign(Error(`TOOL_LIMIT_REACHED: retry after ${limit.retry_after} seconds. The per-person ${limit.window} limit of ${limit.limit} tool calls, shared by all your connected clients, applies.${accounting?' Refused calls use no credits.':''}`),{retryAfter:limit.retry_after,window:limit.window});
      };
      // Zero-credit operations still require current entitlement, checked per call rather than from the OAuth grant.
      const currentAccess=async()=>{if(!accounting)return null;const access=await accounting.access(user);await state('budget_class',{pro:access.access==='pro'});return access;};
      const requireAccess=async()=>{const access=await currentAccess();if(access?.access==='denied')throw Error(accessError(access));return access;};
      let engine,index,toolHandled=false;
      // Status reads the last complete snapshot in any delivery state; search/details fail closed.
      const getIndex=async()=>index??=await catalog(env.CATALOG,{status:true});
      const getEngine=async()=>{
        const current=await getIndex(),delivery=current.delivery?.state;
        if(delivery==='stale')throw Error('CATALOG_STALE');
        if(delivery==='updating')throw Object.assign(Error('CATALOG_UPDATING'),{retryAfter:current.delivery.retry_after_seconds});
        return engine??=sharedEngine(current,env);
      };
      const server=new McpServer({name:'inspora-hosted-pilot',version:'0.2.0'},{instructions:searchInstructions});
      const handleResponse=(name,fn)=>async(args,extra)=>{
        toolHandled=true;const started=Date.now();let outcome='ok';
        try{await toolLimit();return await fn(args,extra);}
        catch(error){const result=errorResult(error);outcome=JSON.parse(result.content[0].text).error.match(/^[A-Z_]+/)?.[0]??'ERROR';return result;}
        // Minimal identity-free observability: tool, outcome code and duration only.
        finally{if(env.MCP_OBSERVABILITY==='minimal')console.log(JSON.stringify({event:'mcp_tool',tool:name,outcome,ms:Date.now()-started}));}
      };
      // structuredContent mirrors the JSON text block, which stays first for older clients.
      const structured=(name,fn)=>handleResponse(name,async(args,extra)=>{const value=await fn(args,extra);return {...data(value),structuredContent:value};});
      server.registerTool('search_inspiration',{...searchTool,outputSchema:searchOutput,annotations},structured('search_inspiration',async(args,extra)=>{
        const parsed=searchSchema.parse(args);
        // Continuation of an existing search is free; only a fresh search is billable.
        const billable=accounting&&!parsed.cursor;
        let key,reservation;
        if(billable){
          const access=await requireAccess();
          key=operationKey(user,sessionId,extra?.requestId,parsed);
          const receipt=await state('receipt_get',{key});
          if(receipt.value){
            let replayBalance=access?.balance;
            // Cached retry results remain subject to current catalog eligibility.
            const current=await getEngine();
            if(receipt.value.results.some(work=>!current.byId.has(work.id)))throw Error('WORK_NOT_ELIGIBLE: A cached work is no longer available. Start a new search.');
            if(receipt.pending){
              const settled=await accounting.complete(user,key,receipt.value.results.length);
              replayBalance=settled.balance??replayBalance;
              if(receipt.value.results.length>0&&settled.state!=='settled')throw Error('ACCOUNTING_UNAVAILABLE: The original hold expired. Start a new search; it was not charged.');
              receipt.value.account={...receipt.value.account,credits_charged:0,...(settled.balance?{credits_available:settled.balance.available}:{})};
              await state('receipt_put',{key,result:receipt.value});
            }
            return {...receipt.value,account:{...receipt.value.account,credits_charged:0,...(replayBalance?{credits_available:replayBalance.available}:{})},replayed:true};
          }
          reservation=await accounting.reserve(user,key);
          if(reservation.access==='denied'||reservation.state==='in_progress')throw Error(accessError(reservation));
          if(reservation.state==='replayed')throw Error('OPERATION_IN_PROGRESS: The original result is no longer cached. Start a new search with a new request id; this operation will not be charged again.');
        }else await requireAccess();
        const charged=reservation?.access==='pro'&&reservation.state==='reserved';
        let result,saved;
        try{
          const engine=await getEngine();
          if(parsed.cursor){saved=unpackContinuation(await state('take',{args:parsed,snapshotId:engine.index.snapshotId}));engine.cursors.set(parsed.cursor,saved);}
          result=await engine.search(parsed);
          if(result.next_cursor){
            const value=engine.cursors.get(result.next_cursor);engine.cursors.delete(result.next_cursor);
            if(parsed.cursor)result.next_cursor=continuationCursor(parsed.cursor,parsed);
            await state('put',{cursor:result.next_cursor,value:packContinuation(value)});
          }
        }catch(error){
          // Service failures release the reservation; an unreleased hold expires and is returned.
          if(charged)await accounting.complete(user,key,0).catch(()=>{});
          throw error;
        }
        result.snapshot.live=true;
        // A capped continuation ends before the full ranked match list; that is not a shortage.
        const capped=saved?.limited&&result.exhausted;
        if(capped){result.insufficient_matches=false;result.continuation_limited=true;}
        result.notice=capped?`Continuation covers ${CONTINUATION_MAX_WORKS} further ranked works and has ended. For more, refine the query or start a new search with exclude_ids.`:
          // Keep the engine's evidence-count guidance; only the provenance differs.
          result.notice.replace(/^Dated local catalog\. /,'Synchronized catalog. ');
        if(reservation?.access==='pro'){
          // Settle once when at least one work is returned; empty results are released (zero credits).
          result.account={access:'pro',credits_charged:0,manage_url:reservation.manage_url};
          // Save the computed result before settlement so a lost response from
          // accounting can be reconciled on retry without another search/charge.
          await state('receipt_put',{key,result,pending:true});
          let settled=null;
          // Do not deliver billable results until accounting confirms settlement.
          // A timeout leaves the hold intact for a safe retry, rather than returning
          // unlimited free results while the accounting service is unavailable.
          if(charged)settled=await accounting.complete(user,key,result.results.length);
          if(result.results.length>0&&settled?.state!=='settled')throw Error('ACCOUNTING_UNAVAILABLE: The credit hold expired. Start a new search; it was not charged.');
          const used=settled?.state==='settled';
          result.account={access:'pro',credits_charged:used?1:0,...(settled?.balance?{credits_available:settled.balance.available}:{}),manage_url:reservation.manage_url};
          await state('receipt_put',{key,result}).catch(()=>{});
        }
        return result;
      }));
      const detailsReply=async(ids,args,batch=false)=>{
        await requireAccess();
        const engine=await getEngine();
        return workReply(engine,ids,args,{live:true,batch,loadVisuals:(row,options)=>hostedVisuals(env.CATALOG,row,options)});
      };
      const detailAnnotations={...annotations,idempotentHint:true},details=detailTools({detailSchema,batchDetailSchema});
      server.registerTool('get_work',{...details.get_work,annotations:detailAnnotations},handleResponse('get_work',({id,...args})=>detailsReply([id],args)));
      server.registerTool('get_works',{...details.get_works,annotations:detailAnnotations},handleResponse('get_works',({ids,...args})=>detailsReply(ids,args,true)));
      const inputs={search_inspiration:searchSchema,get_work:details.get_work.inputSchema,get_works:details.get_works.inputSchema,catalog_status:catalogStatusTool.inputSchema};
      server.registerTool('catalog_status',{...catalogStatusTool,outputSchema:statusOutput,annotations:{...annotations,idempotentHint:true}},structured('catalog_status',async()=>{
        // Status is zero-credit and stays available to inactive accounts so they can see how to restore access.
        const account=accounting?accountView(await currentAccess()):undefined;
        let current;
        try{current=await getIndex();}catch(error){return {...(account?{account}:{}),search_revision:SEARCH_REVISION,catalog_state:'unavailable',live:false,error:toolError(error)};}
        const catalogState=current.delivery?.state??'ready',rows=(engine??=sharedEngine(current,env)).rows;
        return {...(account?{account}:{}),search_revision:SEARCH_REVISION,catalog_state:catalogState,...(catalogState==='updating'?{retry_after_seconds:current.delivery.retry_after_seconds}:{}),
          captured_at:current.capturedAt,variant:current.variant,live:catalogState==='ready',delivery:current.delivery,
          counts:Object.fromEntries(['design','website','logo','icon'].map(kind=>[kind,rows.filter(row=>row.kind===kind).length])),
          limits:{default_count:DEFAULT_COUNT,max_count:20,response_chars:12000,inline_image_base64_bytes:VISUAL_RESPONSE_BYTES,max_detail_batch:6,cursor_minutes:CURSOR_TTL_MS/60000,cursor_single_use:false,cursor_rereadable:true,tool_calls_per_minute:TOOL_LIMITS.minute,tool_calls_per_day:TOOL_LIMITS.day}};
      }));
      const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      await server.connect(transport);
      try{
        const response=await transport.handleRequest(request,{parsedBody:body});
        const headers=new Headers(response.headers);for(const [name,value] of Object.entries(responseHeaders))headers.set(name,value);
        if(sessionId&&response.ok)headers.set('Mcp-Session-Id',sessionId);
        // Errors raised by the SDK before a handler runs (input validation, unknown tool)
        // become the same JSON error shape, with a validation summary from the tool schema.
        if(body?.method==='tools/call'&&!toolHandled&&response.ok){
          const reply=await response.json();
          if(reply.result?.isError){
            const name=body.params?.name,tool=typeof name==='string'&&Object.hasOwn(inputs,name)?inputs[name]:null,parsed=tool?.safeParse(body.params?.arguments??{});
            const message=parsed&&!parsed.success?toolError(parsed.error):`INVALID_INPUT: ${String(reply.result.content?.[0]?.text??'invalid tool call').replace(/^MCP error -?\d+: /,'').slice(0,200)}. ${tool?fixInput:'Call tools/list for the available tools.'}`;
            reply.result=errorResult(null,message);
          }
          return Response.json(reply,{status:response.status,headers});
        }
        return new Response(response.body,{status:response.status,headers});
      }finally{await server.close();}
    }catch(error){
      return error.message==='BODY_TOO_LARGE'?fail(413,'Request too large'):fail(503,'MCP temporarily unavailable');
    }
  }};
}

export {fail as failureResponse};
