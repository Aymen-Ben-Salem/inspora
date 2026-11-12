import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {Pool} from '@neondatabase/serverless';
import {loadProductionMediaEnvironment} from './lib/production-environment.ts';
import {createCatalogFeed} from '../tools/inspora-mcp/catalog-feed.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--production-public-readonly'))throw Error('Explicit --production-public-readonly source selection required');
if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()!=='preview/archive-updates')throw Error('Run the pilot bridge from the Preview branch');
const environment=loadProductionMediaEnvironment();
const pool=new Pool({connectionString:environment.databaseUrlUnpooled,max:1,connectionTimeoutMillis:15000});
const query=fs.readFileSync(path.join(root,'tools/inspora-mcp/capture.sql'),'utf8');
async function capture(){const client=await pool.connect();try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='60s'");
  const capturedAt=new Date((await client.query('SELECT now() AS captured_at')).rows[0].captured_at).toISOString();
  const rows=(await client.query(query)).rows;await client.query('COMMIT');
  return JSON.parse(JSON.stringify({capturedAt,rows}));
}catch{await client.query('ROLLBACK').catch(()=>{});throw Error('Read-only catalog capture failed');}finally{client.release();}}
const enrichmentFile=path.join(root,'tools/inspora-mcp/data/enrichment.json');
const readEnrichment=()=>fs.existsSync(enrichmentFile)?JSON.parse(fs.readFileSync(enrichmentFile,'utf8')):{version:1,entries:[]};
let bridge;
try{bridge=await createCatalogFeed({capture,readEnrichment});console.log('Read-only public catalog bridge listening at '+bridge.url);}catch{console.error('Catalog bridge startup failed; provider details suppressed');await pool.end();process.exit(1);}
async function close(){await bridge.close();await pool.end();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
