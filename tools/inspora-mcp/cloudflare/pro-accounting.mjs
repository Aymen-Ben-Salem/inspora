import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {stable} from '../enrichment.mjs';

// Client for the website's private Pro accounting boundary. The Worker owns no
// billing state: entitlement, balances and the ledger live in the shared Pro service.
const defaultManage='https://www.inspora.design/account/pro';
const manageUrl=value=>{
  try{
    const url=new URL(value),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash||url.pathname!=='/account/pro')return defaultManage;
    return url.href;
  }catch{return defaultManage;}
};

export function createAccounting(env,fetchImpl=fetch){
  if(!env.PRO_ACCOUNTING_URL)return null;
  let url;try{url=new URL(env.PRO_ACCOUNTING_URL);}catch{throw Error('ACCOUNTING_MISCONFIGURED');}
  const loopback=['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!loopback)||url.username||url.password||url.search||url.hash||url.pathname!=='/api/internal/pro/mcp-usage'||!/^[A-Za-z0-9_-]{43,128}$/.test(env.PRO_ACCOUNTING_TOKEN??''))throw Error('ACCOUNTING_MISCONFIGURED');
  const call=async body=>{
    let response;
    try{response=await fetchImpl(url.href,{method:'POST',headers:{Authorization:'Bearer '+env.PRO_ACCOUNTING_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});}
    catch{throw Error('ACCOUNTING_UNAVAILABLE: retry later');}
    if(!response.ok)throw Error('ACCOUNTING_UNAVAILABLE: retry later');
    const value=await response.json();
    if(value.manage_url!==undefined)value.manage_url=manageUrl(value.manage_url);
    return value;
  };
  return {
    access:userId=>call({action:'access',userId}),
    reserve:(userId,operationKey)=>call({action:'reserve',userId,operationKey,feature:'mcp_search'}),
    complete:(userId,operationKey,resultCount)=>call({action:'complete',userId,operationKey,resultCount}),
  };
}

/**
 * Replay identity: a JSON-RPC request id with identical arguments within one
 * signed MCP session is a retry of one operation (no second charge). A new
 * session or request id starts a new operation, even with identical arguments.
 */
export function operationKey(userId,sessionId,requestId,args){
  return createHash('sha256').update(['inspora-op-v2',userId,sessionId,JSON.stringify(requestId??null),stable(args)].join('\n')).digest('base64url');
}

// Standard MCP session headers scope JSON-RPC ids to one client initialization.
// Sessions are signed and user-bound; no account/payment data is encoded in them.
const sessionSignature=(userId,value,secret)=>createHmac('sha256',secret).update(['inspora-session-v1',userId,value].join('\n')).digest('base64url');
export function newAccountingSession(userId,secret,now=Date.now()){
  const value=randomBytes(24).toString('base64url')+'.'+Math.floor(now+30*86400000);
  return value+'.'+sessionSignature(userId,value,secret);
}
export function validAccountingSession(sessionId,userId,secret,now=Date.now()){
  if(typeof sessionId!=='string'||!/^[-_A-Za-z0-9]{32}\.\d{13}\.[-_A-Za-z0-9]{43}$/.test(sessionId))return false;
  const [nonce,expires,signature]=sessionId.split('.');
  if(Number(expires)<=now)return false;
  const expected=sessionSignature(userId,nonce+'.'+expires,secret);
  return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}

/** Minimal model-visible guidance: access state, balance and the website link; never payment details. */
export function accessError(response){
  const link=manageUrl(response.manage_url);
  if(response.state==='in_progress')return 'OPERATION_IN_PROGRESS: This same search is still being processed. Retry shortly; it will not be charged twice.';
  if(response.reason==='payment_review')return `PAYMENT_REVIEW: Inspora Pro is paused while a payment is under review. Balances are preserved. Details: ${link}`;
  if(response.reason==='insufficient_credits')return response.recharge_pending
    ?`CREDITS_EXHAUSTED: No Inspora credits remain. An automatic top-up is being processed; retry in a minute. Manage credits: ${link}`
    :`CREDITS_EXHAUSTED: No Inspora credits remain for new searches. Continuation pages and work details stay free. Add credits: ${link}`;
  return `PRO_REQUIRED: Inspora MCP search requires an active Inspora Pro subscription. Manage it at ${link}`;
}

export function accountView(response){
  if(!response||response.access==='trial')return {access:'team_trial'};
  return {access:response.access==='pro'?'pro':'inactive',...(response.reason?{reason:response.reason}:{}),...(response.balance?{credits_available:response.balance.available}:{}),manage_url:manageUrl(response.manage_url)};
}
