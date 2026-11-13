import http from 'node:http';
import {feedSchema,POLL_MS,STALE_MS,MAX_FEED_BYTES} from './sync.mjs';

// Maintainer-side loopback bridge only. It never accepts SQL, paths or write requests.
export async function createCatalogFeed({capture,readEnrichment,port=4174,intervalMs=POLL_MS,now=()=>Date.now()}) {
  let body=null,capturedAt=null,timer,closing=false,pending;
  async function refresh(){
    if(pending)return pending;
    clearTimeout(timer);
    pending=(async()=>{try{
      const catalog=await capture(),enrichment=readEnrichment();
      const feed=feedSchema.parse({version:1,catalog,enrichment});
      const text=JSON.stringify(feed);if(Buffer.byteLength(text)>MAX_FEED_BYTES)throw Error('Feed too large');
      if(capturedAt&&Date.parse(catalog.capturedAt)<Date.parse(capturedAt))throw Error('Older capture');
      body=text;capturedAt=catalog.capturedAt;
    }catch{ /* Keep the last complete body; the request handler expires it. */ }
    finally{pending=null;if(!closing)timer=setTimeout(refresh,intervalMs);}})();
    return pending;
  }
  const server=http.createServer((request,response)=>{
    const host=request.headers.host;
    if(request.method!=='GET'||request.url!=='/catalog'||host!==`127.0.0.1:${server.address().port}`){response.writeHead(404);response.end();return;}
    if(!body||now()-Date.parse(capturedAt)>STALE_MS){response.writeHead(503,{'Cache-Control':'no-store'});response.end();return;}
    response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(body);
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await refresh();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}/catalog`,refresh,close:async()=>{closing=true;clearTimeout(timer);await pending;clearTimeout(timer);await new Promise(resolve=>server.close(resolve));}};
}
