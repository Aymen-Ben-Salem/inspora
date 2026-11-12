import path from 'node:path';import {fileURLToPath} from 'node:url';
import {CatalogSync,POLL_MS} from './sync.mjs';import {embed,dispose} from './model.mjs';
const at=process.argv.indexOf('--data'),directory=at<0?path.join(path.dirname(fileURLToPath(import.meta.url)),'data'):path.resolve(process.argv[at+1]);
const url=process.env.INSPORA_CATALOG_URL;if(!url)throw Error('Missing catalog source');
const fetcher=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Model/runtime network is disabled');};
const configured=Number(process.env.INSPORA_SYNC_POLL_MS??POLL_MS);
if(!Number.isInteger(configured)||configured<1000||configured>POLL_MS)throw Error('Invalid synchronization interval');
const sync=new CatalogSync({url,directory,embed,fetcher,pollMs:configured});
let closing=false,timer;
async function cycle(){await sync.tick();if(!closing)timer=setTimeout(cycle,configured);}
async function close(){closing=true;clearTimeout(timer);await sync.pending;await dispose();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);process.on('disconnect',close);
await cycle();
