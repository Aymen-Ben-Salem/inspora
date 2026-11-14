// Maintainer CLI only. Never import credentials or child_process into the Worker.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function cloudflareApi(account) {
  if(!/^[a-f0-9]{32}$/.test(account??''))throw Error('Set the verified CLOUDFLARE_ACCOUNT_ID');
  let token=process.env.CLOUDFLARE_API_TOKEN;
  if(!token){
    let auth;
    try{
      const cli=fileURLToPath(new URL('../node_modules/wrangler/wrangler-dist/cli.js',import.meta.url));
      auth=JSON.parse(execFileSync(process.execPath,[cli,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}}));
    }catch{throw Error('Cloudflare login unavailable; captured credential output is not displayed');}
    if(!['oauth','api_token'].includes(auth.type))throw Error('Use Wrangler OAuth or a scoped API token');
    token=auth.token;
  }
  if(!token)throw Error('Cloudflare login required');
  return async(path,{method='GET',body}={})=>{
    if(!path.startsWith('/')||path.includes('..')||path.includes('?')||path.includes('#'))throw Error('Invalid Cloudflare resource');
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000),redirect:'error'});
    const envelope=await response.json();
    if(!response.ok||!envelope.success)throw Error(`CLOUDFLARE_API_${response.status}: codes ${(envelope.errors??[]).map(error=>error.code).join(',')}`);
    return envelope.result;
  };
}
