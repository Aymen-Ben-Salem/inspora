import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';import {z} from 'zod';
import {SearchEngine,searchSchema,detailSchema,batchDetailSchema,CURSOR_TTL_MS,SEARCH_REVISION,DEFAULT_COUNT} from './search.mjs';import {embed,dispose} from './model.mjs';
import {localVisuals} from './preview.mjs';
import {workReply,detailTools,VISUAL_RESPONSE_BYTES} from './visuals.mjs';
import {fork} from 'node:child_process';
import {STALE_MS} from './sync.mjs';
import {connection} from './connection.mjs';
import {searchInstructions} from './instructions.mjs';
import {searchTool,catalogStatusTool} from './tool-definitions.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const option=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
const variant=option('--variant','enriched'),ranking=option('--ranking','hybrid');
if(!['original','draft','enriched'].includes(variant)||!['hybrid','lexical','semantic'].includes(ranking))throw Error('Invalid launch option');
const dataDir=path.resolve(option('--data',path.join(dir,'data')));
const indexPath=path.join(dataDir,'index-'+variant+'.json');let mtime=0,engine;
function refresh(){const stat=fs.statSync(indexPath,{bigint:true}),changed=String(stat.mtimeNs)+':'+stat.size;if(changed!==mtime){const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));if(engine){if(index.snapshotId!==engine.index.snapshotId)engine.replaceIndex(index);else engine.index=index;}else engine=new SearchEngine(index,{embed,ranking});mtime=changed;}}
refresh();globalThis.fetch=async()=>{throw Error('Network disabled in retrieval server');};
const syncConnection=variant==='enriched'?connection():null;
const syncUrl=syncConnection?.url;
const syncWorker=syncUrl?fork(path.join(dir,'sync-worker.mjs'),['--data',dataDir],{stdio:['ignore','ignore','inherit','ipc'],env:Object.fromEntries(Object.entries({PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,INSPORA_MODEL_CACHE:process.env.INSPORA_MODEL_CACHE,INSPORA_CATALOG_URL:syncUrl,INSPORA_CATALOG_TOKEN:syncConnection.token,INSPORA_SYNC_POLL_MS:process.env.INSPORA_SYNC_POLL_MS}).filter(([,value])=>value!==undefined))}):null;
let syncWorkerFailed=false;syncWorker?.on('exit',()=>{syncWorkerFailed=true;});
function syncStatus(){let state={enabled:Boolean(syncUrl)};const file=path.join(dataDir,'sync-status.json');if(syncUrl&&fs.existsSync(file))try{state={...state,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}return {...state,workerFailed:syncWorkerFailed,stale:!syncUrl||syncWorkerFailed||!state.lastSuccessAt||Date.now()-Date.parse(state.lastSuccessAt)>STALE_MS||Date.now()-Date.parse(engine.index.capturedAt)>STALE_MS};}
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false};
const server=new McpServer({name:'inspora-private-pilot',version:'0.1.0'},{instructions:searchInstructions+'\nThis local server may use a dated snapshot. Report freshness from the response.'});
const textResult=data=>({content:[{type:'text',text:JSON.stringify(data)}]});
function handled(fn){return async args=>{const start=performance.now();try{refresh();const out=await fn(args);if(option('--metrics',null)){const row={at:new Date().toISOString(),duration_ms:performance.now()-start,output_chars:JSON.stringify(out).length};fs.appendFileSync(path.join(dir,'data','server-metrics.jsonl'),JSON.stringify(row)+'\n');}return out;}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e instanceof z.ZodError?'INVALID_INPUT: '+e.issues.slice(0,3).map(i=>(i.path.join('.')||'arguments')+': '+i.message).join('; ').slice(0,240)+'. Fix the arguments to match the tool schema and retry.':String(e.message).slice(0,300)})}]};}};}
server.registerTool('search_inspiration',{...searchTool,annotations},handled(async args=>textResult(await engine.search(args))));
const loadVisuals=(row,options)=>localVisuals(dataDir,row,options);
const detailAnnotations={...annotations,idempotentHint:true},details=detailTools({detailSchema,batchDetailSchema});
server.registerTool('get_work',{...details.get_work,annotations:detailAnnotations},handled(({id,...args})=>workReply(engine,[id],args,{loadVisuals})));
server.registerTool('get_works',{...details.get_works,annotations:detailAnnotations},handled(({ids,...args})=>workReply(engine,ids,args,{loadVisuals,batch:true})));
server.registerTool('catalog_status',{...catalogStatusTool,annotations:detailAnnotations},handled(async()=>textResult({name:'Inspora private pilot',search_revision:SEARCH_REVISION,captured_at:engine.index.capturedAt,variant,ranking,counts:Object.fromEntries(['design','website','logo','icon'].map(k=>[k,engine.rows.filter(r=>r.kind===k).length])),enrichment:engine.index.enrichment??null,synchronization:syncStatus(),live:false,review:'pending',limits:{default_count:DEFAULT_COUNT,max_count:20,response_chars:12000,detail_chars:10000,inline_image_base64_bytes:VISUAL_RESPONSE_BYTES,max_detail_batch:6,cursor_minutes:CURSOR_TTL_MS/60000,cursor_single_use:false,cursor_rereadable:true}})));
const transport=new StdioServerTransport();await server.connect(transport);transport.onclose=()=>{if(syncWorker?.connected)syncWorker.disconnect();dispose().finally(()=>process.exit(0));};
