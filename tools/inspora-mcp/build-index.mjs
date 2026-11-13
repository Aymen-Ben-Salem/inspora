import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildIndex,writeAtomic} from './index-builder.mjs';import {MODEL,embed,dispose} from './model.mjs';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'data'),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const snapshot=read('catalog.json'),manifest=fs.existsSync(path.join(dir,'draft-manifest.json'))?read('draft-manifest.json'):{drafts:[]},enrichment=fs.existsSync(path.join(dir,'enrichment.json'))?read('enrichment.json'):{version:1,entries:[]},started=performance.now();
// Network is forbidden for the entire indexing process, including model loading.
let forbidden=0;globalThis.fetch=async()=>{forbidden++;throw Error('Network disabled in index build');};
const previous=['original','draft','enriched'].flatMap(variant=>fs.existsSync(path.join(dir,'index-'+variant+'.json'))?[read('index-'+variant+'.json')]:[]);
try {
  for(const variant of ['original','draft','enriched']){
    const index=await buildIndex(snapshot,{manifest,enrichment,variant,previous,embed,onProgress:(done,total)=>console.error(variant+' '+done+'/'+total)});
    writeAtomic(path.join(dir,'index-'+variant+'.json'),index);previous.push(index);console.error(variant+': '+index.rows.length+' eligible works');
  }
}finally{await dispose();}
writeAtomic(path.join(dir,'build-metrics.json'),{at:new Date().toISOString(),node:process.version,model:MODEL,elapsedMs:performance.now()-started,networkAttempts:forbidden});
