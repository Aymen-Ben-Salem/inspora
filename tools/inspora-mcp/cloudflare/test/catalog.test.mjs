import test from 'node:test';
import assert from 'node:assert/strict';
import {work,note,embed} from '../../test/fixtures.mjs';
import {buildCatalog,publishCatalog,createCatalogReader,POINTER_KEY,MAX_SOURCE_AGE_MS} from '../catalog.mjs';
import {MODEL,chunks,createEmbed} from '../embeddings.mjs';
import {Bucket} from './helpers.mjs';

const feed=(rows=[work(1)],entries=rows.map(row=>note(row)))=>({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries}});

test('Cloudflare indexes rebuild model vectors and reuse only unchanged matching-model text',async()=>{
  let embedded=0;
  const embedding=async texts=>{embedded+=texts.length;return embed(texts);};
  const first=await buildCatalog(feed(),{embed:embedding});assert.equal(embedded,1);assert.deepEqual(first.model,MODEL);
  const input=feed();
  const second=await buildCatalog(input,{embed:embedding,previous:first});assert.equal(embedded,1);assert.equal(second.snapshotId,first.snapshotId);
  await buildCatalog(input,{embed:embedding,previous:{...first,model:{name:'MiniLM'}}});assert.equal(embedded,2);
  const changed=work(1);changed.description='Updated public description';
  const newer=await buildCatalog(feed([changed],feed().enrichment.entries),{embed:embedding,previous:first});
  assert.equal(newer.rows[0].searchOnly,'');assert.equal(newer.rows[0].enrichmentStatus,'stale');assert.notEqual(newer.snapshotId,first.snapshotId);
});

test('R2 publication commits only a complete index; removals, stale source and out-of-order updates fail closed',async()=>{
  const bucket=new Bucket(),reader=createCatalogReader();
  const first=await buildCatalog(feed([work(1),work(2)]),{embed});await publishCatalog(bucket,first);
  assert.equal((await reader(bucket)).rows.length,2);
  const second=await buildCatalog(feed([work(1),{...work(2),status:'draft'}]),{embed,previous:first});
  const oldPointer=bucket.values.get(POINTER_KEY),put=bucket.put.bind(bucket);
  bucket.put=async(key,value)=>{if(key!==POINTER_KEY)throw Error('storage outage');return put(key,value);};
  await assert.rejects(publishCatalog(bucket,second),/outage/);assert.equal(bucket.values.get(POINTER_KEY),oldPointer);
  bucket.put=put;await publishCatalog(bucket,second);assert.equal((await reader(bucket)).rows.length,1);
  const later=createCatalogReader({now:()=>Date.now()+MAX_SOURCE_AGE_MS+1000});await assert.rejects(later(bucket),/STALE/);
  await assert.rejects(publishCatalog(bucket,{...first,capturedAt:new Date(Date.now()-10000).toISOString()}),/OUT_OF_ORDER/);
  const stale=feed();stale.catalog.capturedAt=new Date(Date.now()-MAX_SOURCE_AGE_MS-1000).toISOString();await assert.rejects(buildCatalog(stale,{embed}),/STALE/);
});

test('catalog reader rejects incompatible or tampered vectors before retrieval',async()=>{
  const bucket=new Bucket(),index=await buildCatalog(feed(),{embed}),pointer=await publishCatalog(bucket,index);
  bucket.values.set(pointer.objectKey,JSON.stringify({...index,model:{...MODEL,pooling:'mean'}}));
  await assert.rejects(createCatalogReader()(bucket),/MODEL_MISMATCH/);
  bucket.values.set(pointer.objectKey,JSON.stringify({...index,rows:[{...index.rows[0],searchOnly:'Tampered'}]}));
  await assert.rejects(createCatalogReader()(bucket),/INTEGRITY/);
});

test('managed embeddings preserve long text, bound UTF-8 chunks, validate output and pin pooling',async()=>{
  const text='字🌈 long text '.repeat(1000)+'distinctive final typography';
  assert.equal(chunks(text).join(''),text);assert.ok(chunks(text).every(part=>new TextEncoder().encode(part).length<=400));
  let calls=0;const embedding=createEmbed({run:async(model,args)=>{calls++;assert.equal(model,MODEL.name);assert.equal(args.pooling,'cls');assert.ok(args.text.length<=32);return {data:await embed(args.text)};}});
  const vectors=await embedding([text,'short']);assert.equal(vectors.length,2);assert.ok(calls>1);assert.equal(vectors[0].length,384);assert.equal(vectors[0][0],1);
  await assert.rejects(createEmbed({run:async()=>({data:[[NaN]]})})(['text']),/INVALID/);
});
