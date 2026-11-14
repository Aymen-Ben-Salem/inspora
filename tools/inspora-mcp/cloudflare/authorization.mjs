import {OAuthProvider,AuthorizationError} from '@cloudflare/workers-oauth-provider';
import {randomBytes} from 'node:crypto';
import {sha} from '../catalog.mjs';

const validTicket=value=>/^[A-Za-z0-9_-]{43}$/.test(value??'');
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const fail=(status,error)=>Response.json({error},{status,headers});
const escape=value=>String(value).replace(/[&<>"']/g,char=>'&#'+char.charCodeAt(0)+';');

export class AuthorizationTickets {
  constructor(state){this.state=state;}
  async fetch(request){
    const {action,value,userId,decision}=await request.json(),storage=this.state.storage;
    if(action==='create'){
      if(await storage.get('ticket'))return fail(409,'AUTH_TICKET_EXISTS');
      await storage.put('ticket',value);await storage.setAlarm(value.expiresAt);return Response.json({ok:true});
    }
    return storage.transaction(async transaction=>{
      const ticket=await transaction.get('ticket');
      if(!ticket||ticket.expiresAt<=Date.now())return fail(410,'AUTH_TICKET_EXPIRED');
      if(action==='inspect')return Response.json({description:ticket.description});
      if(action==='approve'){
        if(!/^user_[A-Za-z0-9]{1,100}$/.test(userId??'')||!['approve','deny'].includes(decision)||ticket.userId)return fail(409,'AUTH_TICKET_INVALID');
        await transaction.put('ticket',{...ticket,userId,decision});return Response.json({ok:true});
      }
      if(action==='take'){
        if(!ticket.userId)return fail(409,'AUTH_NOT_APPROVED');
        await transaction.delete('ticket');return Response.json(ticket);
      }
      return fail(400,'INVALID_ACTION');
    });
  }
  async alarm(){await this.state.storage.deleteAll();}
}

function ticketStore(env,ticket){
  if(!validTicket(ticket))throw Error('AUTH_TICKET_INVALID');
  const instance=env.AUTH_TICKETS.get(env.AUTH_TICKETS.idFromName(ticket));
  return async(action,input={})=>{
    const response=await instance.fetch('https://ticket.internal/',{method:'POST',body:JSON.stringify({action,...input})});
    const value=await response.json();if(!response.ok)throw Error(value.error);return value;
  };
}

export async function authorizationHandler(request,env){
  const url=new URL(request.url),oauth=env.OAUTH_PROVIDER;
  if(url.origin!==env.MCP_ORIGIN)return fail(404,'Not found');
  try{
    if(url.pathname==='/internal/authorization'){
      if(request.method!=='POST'||!/^[A-Za-z0-9_-]{43,128}$/.test(env.MCP_AUTH_BRIDGE_TOKEN??'')||sha(request.headers.get('authorization')??'')!==sha('Bearer '+env.MCP_AUTH_BRIDGE_TOKEN))return fail(401,'Access required');
      const input=await request.json();
      if(!['inspect','approve'].includes(input.action))return fail(400,'INVALID_ACTION');
      return Response.json(await ticketStore(env,input.ticket)(input.action,{userId:input.userId,decision:input.decision}),{headers});
    }
    if(url.pathname==='/authorize'&&request.method==='GET'){
      const authRequest=await oauth.parseAuthRequest(request);
      if(!authRequest.scope.includes('inspiration:read')||authRequest.scope.some(scope=>!['inspiration:read','offline_access'].includes(scope)))return fail(400,'Unsupported scope');
      const description=await oauth.describeConsent(authRequest),consent=await oauth.beginConsent(authRequest);
      const ticket=randomBytes(32).toString('base64url');
      await ticketStore(env,ticket)('create',{value:{handle:consent.handle,description,expiresAt:Date.now()+10*60000}});
      const target=new URL('https://www.inspora.design/api/inspora/mcp/authorize');target.searchParams.set('ticket',ticket);
      consent.headers.set('Location',target.href);for(const [name,value] of Object.entries(headers))consent.headers.set(name,value);
      return new Response(null,{status:302,headers:consent.headers});
    }
    if(url.pathname==='/authorize/complete'&&request.method==='GET'){
      const ticket=url.searchParams.get('ticket');if(!validTicket(ticket))return fail(400,'Invalid connection');
      const nonce=randomBytes(24).toString('base64url');
      return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Connecting to Inspora</title><p>Finishing your connection…</p><form method="post" action="/authorize/complete"><input type="hidden" name="ticket" value="${escape(ticket)}"><button>Continue</button></form><script nonce="${nonce}">document.querySelector('form').submit()</script></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`}});
    }
    if(url.pathname==='/authorize/complete'&&request.method==='POST'){
      if(request.headers.get('origin')!==env.MCP_ORIGIN)return fail(403,'Origin rejected');
      const form=await request.formData(),ticket=await ticketStore(env,String(form.get('ticket')))('take');
      if(ticket.decision==='deny'){
        const denied=await oauth.denyConsent(request,ticket.handle);return new Response(null,{status:302,headers:denied.headers});
      }
      const approved=await oauth.approveConsent(request,ticket.handle);
      const {redirectTo}=await oauth.completeAuthorization({request:approved.request,userId:ticket.userId,metadata:{},scope:approved.request.scope,props:{userId:ticket.userId}});
      approved.headers.set('Location',redirectTo);return new Response(null,{status:302,headers:approved.headers});
    }
    return fail(404,'Not found');
  }catch(error){
    if(error instanceof AuthorizationError&&error.redirectTo)return Response.redirect(error.redirectTo,302);
    return fail(400,'Connection expired or could not be verified. Start again from your MCP client.');
  }
}

let configured;
export function oauthProvider(env,apiHandler){
  if(configured?.origin===env.MCP_ORIGIN&&configured.handler===apiHandler)return configured.provider;
  const provider=new OAuthProvider({apiRoute:'/mcp',apiHandler,defaultHandler:{fetch:authorizationHandler},authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',scopesSupported:['inspiration:read','offline_access'],requiredScopes:['inspiration:read'],resourceMetadata:{resource:env.MCP_ORIGIN+'/mcp',authorization_servers:[env.MCP_ORIGIN]},accessTokenTTL:3600,refreshTokenTTL:30*86400,clientIdMetadataDocumentEnabled:true});
  configured={origin:env.MCP_ORIGIN,handler:apiHandler,provider};return provider;
}
