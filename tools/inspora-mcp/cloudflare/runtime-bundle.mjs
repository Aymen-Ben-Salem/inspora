import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Miniflare v5's v4 converter requires explicit modules for Text imports.
const root=new URL('./.wrangler/dry-run/',import.meta.url);
export const runtimeModules=[
  {type:'ESModule',path:fileURLToPath(new URL('worker.js',root))},
  ...fs.readdirSync(root).filter(name=>/\.(md|html)$/.test(name)).map(name=>({type:'Text',path:fileURLToPath(new URL(name,root))})),
];
