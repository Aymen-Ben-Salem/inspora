// Explicit one-time download of pinned public weights. Retrieval never downloads.
import {pipeline,env} from '@huggingface/transformers';
import {MODEL,modelCache} from './model.mjs';
env.cacheDir=modelCache;
const extractor=await pipeline('feature-extraction',MODEL.name,{revision:MODEL.revision,dtype:MODEL.dtype,device:'cpu'});
await extractor.dispose();
console.log('Pinned model is ready in '+modelCache);
