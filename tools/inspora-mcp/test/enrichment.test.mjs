import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRows} from '../catalog.mjs';
import {sourceFingerprint,parseEnrichment} from '../enrichment.mjs';
import {buildIndex} from '../index-builder.mjs';
import {work,note,embed} from './fixtures.mjs';
test('hidden enrichment preserves public fields and omits stale prose after edits or media changes',()=>{
  const row=work(1),entry=note(row,{scope:'webpage',typography:'High-contrast serif capitals contrast with small sans-serif labels.'});
  const manifest={version:1,entries:[entry]},snapshot={capturedAt:new Date().toISOString(),rows:[row]};
  const current=normalizeRows(snapshot,null,'enriched',manifest)[0];
  assert.equal(current.description,row.description);assert.deepEqual(current.colors,row.colors);assert.equal(current.enrichmentStatus,'current');assert.match(current.text,/High-contrast serif/);
  for(const change of [{description:'The team edited the public caption.'},{styles:['Modern']},{updated_at:'2026-01-01T00:00:00.123457Z'},{media:[{type:'image',url:'https://media.inspora.design/changed.webp'}]},{creator_name:'New credit'}]){
    const updated={...row,...change},result=normalizeRows({...snapshot,rows:[updated]},null,'enriched',manifest)[0];assert.equal(result.description,updated.description);assert.equal(result.searchOnly,'');assert.equal(result.enrichmentStatus,'stale');
  }
  assert.equal(normalizeRows(snapshot,null,'enriched',{version:1,entries:[]})[0].enrichmentStatus,'missing');
  assert.equal(normalizeRows({...snapshot,rows:[{...row,status:'draft'}]},null,'enriched',manifest).length,0);
});
test('source fingerprints ignore JSON key order and timestamp format, preserving microsecond version changes',()=>{
  const row=work(1),ordered=Object.fromEntries(Object.entries(row).reverse());
  ordered.updated_at='2026-01-01 00:00:00.123456+00';assert.equal(sourceFingerprint(row),sourceFingerprint(ordered));
  assert.notEqual(sourceFingerprint(row),sourceFingerprint({...row,updated_at:'2026-01-01T00:00:00.123457Z'}));
});
test('typography is selective and enrichment cannot override public captions or taxonomy',()=>{
  const row=work(1),entry=note(row,{typography:'Heavy rounded sans-serif lettering forms the entire composition.'});
  assert.throws(()=>parseEnrichment({version:1,entries:[entry]}),/Typography/);
  assert.doesNotThrow(()=>parseEnrichment({version:1,entries:[{...entry,typographyIsSubject:true}]}));
  assert.throws(()=>parseEnrichment({version:1,entries:[{...note(row),description:'Overwrite public'}]}));
  assert.throws(()=>parseEnrichment({version:1,entries:[note(row),note(row)]}),/Duplicate/);
});
test('unchanged capture reuses vectors and keeps the content revision stable',async()=>{
  const row=work(1),manifest={version:1,entries:[note(row)]};
  const first=await buildIndex({capturedAt:'2026-11-12T12:00:00Z',rows:[row]},{enrichment:manifest,embed});
  const next=await buildIndex({capturedAt:'2026-11-12T12:01:00Z',rows:[row]},{enrichment:manifest,previous:[first],embed:()=>{throw Error('Should reuse vector');}});
  assert.equal(first.snapshotId,next.snapshotId);assert.notEqual(first.capturedAt,next.capturedAt);assert.equal(next.enrichment.current,1);
});
