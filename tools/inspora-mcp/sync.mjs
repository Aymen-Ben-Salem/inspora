import fs from 'node:fs';import path from 'node:path';
import {stable} from './enrichment.mjs';
import {feedSchema} from './feed-schema.mjs';
export {feedSchema} from './feed-schema.mjs';
import {buildIndex,writeAtomic} from './index-builder.mjs';
import {sha} from './catalog.mjs';

export const POLL_MS=60000,STALE_MS=180000,MAX_FEED_BYTES=8*1024*1024;

export function sourceUrl(value) {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(url.hostname))))throw Error('Sync requires an exact HTTPS or loopback HTTP feed URL without credentials/query');
  return url.href;
}
export function feedHeaders(token) {
  if(token!==undefined&&(!/^[a-zA-Z0-9_-]{32,128}$/.test(token)))throw Error('Invalid catalog access token');
  return {Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})};
}
export async function fetchFeed(url,fetcher=fetch,token) {
  const response=await fetcher(sourceUrl(url),{redirect:'error',signal:AbortSignal.timeout(10000),headers:feedHeaders(token)});
  if(!response.ok)throw Error('Feed request failed');
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Feed is not JSON');
  if(Number(response.headers.get('content-length'))>MAX_FEED_BYTES)throw Error('Feed exceeds size limit');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>MAX_FEED_BYTES)throw Error('Feed exceeds size limit');chunks.push(chunk);}
  return feedSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export class CatalogSync {
  constructor({url,token,directory,embed,fetcher=fetch,now=()=>Date.now(),pollMs=POLL_MS}) {
    feedHeaders(token);this.token=token;this.url=sourceUrl(url);this.directory=directory;this.embed=embed;this.fetcher=fetcher;this.now=now;this.pending=null;
    this.indexFile=path.join(directory,'index-enriched.json');this.statusFile=path.join(directory,'sync-status.json');
    this.lockFile=path.join(directory,'sync.lock');
    this.index=fs.existsSync(this.indexFile)?JSON.parse(fs.readFileSync(this.indexFile,'utf8')):null;
    this.state={enabled:true,lastAttemptAt:null,lastSuccessAt:null,lastError:null,failures:0,pollMs,staleAfterMs:STALE_MS};
  }
  status(){const at=this.now(),capturedAt=this.index?.capturedAt;return {...this.state,capturedAt,stale:!this.state.lastSuccessAt||at-Date.parse(this.state.lastSuccessAt)>STALE_MS||!capturedAt||at-Date.parse(capturedAt)>STALE_MS};}
  tick(){if(this.pending)return this.pending;this.pending=this.run().finally(()=>{this.pending=null;});return this.pending;}
  lock(){
    try{const descriptor=fs.openSync(this.lockFile,'wx');fs.writeFileSync(descriptor,JSON.stringify({pid:process.pid}));return ()=>{fs.closeSync(descriptor);fs.unlinkSync(this.lockFile);};}
    catch(error){if(error.code!=='EEXIST')throw error;try{const owner=JSON.parse(fs.readFileSync(this.lockFile,'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Incomplete owner');try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH'){fs.unlinkSync(this.lockFile);return this.lock();}}}catch{if(fs.existsSync(this.lockFile)&&Date.now()-fs.statSync(this.lockFile).mtimeMs>30000){fs.unlinkSync(this.lockFile);return this.lock();}}return null;}
  }
  async run(){
    const unlock=this.lock();
    if(!unlock)return this.status();
    try{
    // Codex and Claude can share this directory; only one worker publishes at a time.
    this.index=fs.existsSync(this.indexFile)?JSON.parse(fs.readFileSync(this.indexFile,'utf8')):null;
    this.state.lastAttemptAt=new Date(this.now()).toISOString();
    try {
      const feed=await fetchFeed(this.url,this.fetcher,this.token),captured=Date.parse(feed.catalog.capturedAt),current=Date.parse(this.index?.capturedAt);
      if(captured>this.now()+60000||this.now()-captured>STALE_MS)throw Error('Feed snapshot is stale or future-dated');
      if(this.index&&captured<current)throw Error('Out-of-order snapshot rejected');
      const sourceRevision=sha(stable([...feed.catalog.rows].sort((a,b)=>a.id.localeCompare(b.id))));
      if(this.index&&captured===current&&this.index.sourceRevision&&sourceRevision!==this.index.sourceRevision)throw Error('Conflicting source snapshot rejected');
      const marker=stable(feed);
      if(marker!==this.lastFeed){
        const index=await buildIndex(feed.catalog,{enrichment:feed.enrichment,previous:this.index?[this.index]:[],embed:this.embed});
        writeAtomic(this.indexFile,index);this.index=index;this.lastFeed=marker;
      }
      this.state.lastSuccessAt=new Date(this.now()).toISOString();this.state.lastError=null;this.state.failures=0;
    } catch {
      // Suppress response bodies, URLs and provider details: they may contain credentials.
      this.state.lastError='Catalog synchronization failed; retaining the last complete index';this.state.failures++;
    }
    writeAtomic(this.statusFile,this.status());return this.status();
    }finally{unlock();}
  }
}
