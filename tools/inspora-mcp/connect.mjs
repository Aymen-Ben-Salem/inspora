// One-time data bootstrap; later content changes arrive through the sync worker.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {connection} from './connection.mjs';import {CatalogSync} from './sync.mjs';import {embed,dispose} from './model.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const at=process.argv.indexOf('--data'),directory=path.resolve(at<0?path.join(root,'data'):process.argv[at+1]);
const source=connection();if(!source)throw Error('Provide a catalog connection file or URL');
fs.mkdirSync(directory,{recursive:true});
const sync=new CatalogSync({...source,directory,embed});
try {const status=await sync.tick();if(status.lastError||!status.lastSuccessAt)throw Error('Catalog setup failed; verify access and prepare the pinned local model');console.log('Catalog ready. Content updates will arrive automatically when the MCP is running.');}
finally {await dispose();}
