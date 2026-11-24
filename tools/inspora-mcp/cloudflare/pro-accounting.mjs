// Client for the website's private Pro access boundary. The Worker owns no billing
// state: the website decides whether an account has active Inspora Pro. There are no
// credits; Pro includes the MCP under the fair-use limits in access-state.mjs.
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
  return {
    async access(userId){
      let response;
      try{response=await fetchImpl(url.href,{method:'POST',headers:{Authorization:'Bearer '+env.PRO_ACCOUNTING_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'access',userId}),redirect:'error',signal:AbortSignal.timeout(5000)});}
      catch{throw Error('ACCOUNTING_UNAVAILABLE: retry later');}
      if(!response.ok)throw Error('ACCOUNTING_UNAVAILABLE: retry later');
      const value=await response.json();
      // Anything other than an explicit pro/trial answer is treated as no access.
      if(value.access!=='pro'&&value.access!=='trial')return {access:'denied',reason:typeof value.reason==='string'?value.reason:'inactive',manage_url:manageUrl(value.manage_url)};
      return value.access==='trial'?{access:'trial'}:{access:'pro',manage_url:manageUrl(value.manage_url)};
    },
  };
}

/** Minimal model-visible guidance: access state and the website link; never payment details. */
export function accessError(response){
  const link=manageUrl(response.manage_url);
  if(response.reason==='payment_review')return `PAYMENT_REVIEW: Inspora Pro is paused while a payment is under review. Details: ${link}`;
  return `PRO_REQUIRED: The Inspora plugin is included with an active Inspora Pro subscription. Subscribe or manage it at ${link}`;
}

export function accountView(response){
  if(!response||response.access==='trial')return {access:'team_trial'};
  return {access:response.access==='pro'?'pro':'inactive',...(response.reason?{reason:response.reason}:{}),manage_url:manageUrl(response.manage_url)};
}
