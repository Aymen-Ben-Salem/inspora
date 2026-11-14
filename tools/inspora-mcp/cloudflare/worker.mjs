import {createWorker,boundedBody,failureResponse as fail} from './http.mjs';
import {oauthProvider} from './authorization.mjs';
export {AccessState,CatalogSync} from './http.mjs';
export {AuthorizationTickets} from './authorization.mjs';
const pilot=createWorker();
const authenticated=createWorker({authenticate:(_request,_env,ctx)=>ctx?.auth?.scope?.includes('inspiration:read')&&/^user_[A-Za-z0-9]{1,100}$/.test(ctx?.props?.userId??'')?ctx.props.userId:null});
export default {async fetch(request,env,ctx){
  if(new URL(request.url).origin!==env.MCP_ORIGIN)return fail(404,'Not found');
  if(env.ACCESS_MODE==='oauth'&&new URL(request.url).pathname!=='/internal/catalog'){
    try{if(request.method==='POST')request=new Request(request,{body:await boundedBody(request)});}catch{return fail(413,'Request too large');}
    return oauthProvider(env,authenticated).fetch(request,env,ctx);
  }
  return pilot.fetch(request,env,ctx);
}};
