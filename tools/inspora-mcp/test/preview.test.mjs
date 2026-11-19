import test from 'node:test';
import assert from 'node:assert/strict';
import {localPreview,localVisuals} from '../preview.mjs';
import {preparedVisuals,workReply,visualAssetKey,visualManifestKey,visualSha,VISUAL_BUDGET_STATUS,VISUAL_RESPONSE_BYTES} from '../visuals.mjs';
import {sha} from '../catalog.mjs';
import {mediaFingerprint} from '../enrichment.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('changed media and unsafe evidence labels cannot return an old local image', () => {
  const row={id:'work',media:[{url:'https://media.inspora.design/new.png'}]};
  const draft={id:'work',label:'D01',sourceVersion:{mediaMetadataSha256:sha([{url:'https://media.inspora.design/old.png'}])}};
  assert.match(localPreview(row,{drafts:[draft]},'.').status,/stale/);
  draft.sourceVersion.mediaMetadataSha256=sha(row.media);
  draft.label='../private';
  assert.match(localPreview(row,{drafts:[draft]},'.').status,/No locally prepared/);
});

test('a synchronized media object with reordered keys keeps its reviewed thumbnail; real changes invalidate it',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inspora-preview-'));
  const original={id:'work',media:[{alt:'Preview',url:'https://media.inspora.design/work.mp4',type:'recording',poster:'https://media.inspora.design/work.webp',preview:{width:320,height:200}}]};
  const indexed={...original,media:[{type:'recording',url:original.media[0].url,poster:original.media[0].poster,alt:'Preview',preview:{height:200,width:320}}]};
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=','base64');
  const manifest={version:2,drafts:[{id:'work',label:'E512',sourceVersion:{mediaMetadataSha256:mediaFingerprint(original)}}]};
  try{
    fs.writeFileSync(path.join(directory,'E512-thumb-0.png'),bytes);
    assert.deepEqual(localPreview(indexed,manifest,directory).bytes,bytes);
    const changed={...indexed,media:[{...indexed.media[0],poster:'https://media.inspora.design/replaced.webp'}]};
    assert.match(localPreview(changed,manifest,directory).status,/stale/);
    const legacy={drafts:[{...manifest.drafts[0],sourceVersion:{mediaMetadataSha256:sha(original.media)}}]};
    assert.deepEqual(localPreview(original,legacy,directory).bytes,bytes);
  }finally{fs.unlinkSync(path.join(directory,'E512-thumb-0.png'));fs.rmdirSync(directory);}
});

test('a valid local pack stopped by the encoded image budget is reported, never replaced by a legacy thumbnail',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inspora-visuals-'));
  const row={id:'00000000-0000-4000-8000-000000000001',kind:'website',media:[{type:'recording',url:'https://media.inspora.design/a.mp4',poster:'https://media.inspora.design/a.webp'}]};
  const assets=['still','overview'].map(role=>{
    const bytes=Buffer.alloc(150_000);bytes[0]=255;bytes[1]=216;bytes[2]=role.length;
    const item={role,width:800,height:600,bytes:bytes.length,sha256:visualSha(bytes),timecodes:[0.5,1.25]};
    const file=path.join(directory,'visuals',...visualAssetKey(row,item,1).split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    return item;
  });
  const manifestFile=path.join(directory,'visuals',...visualManifestKey(row,1).split('/'));
  fs.writeFileSync(manifestFile,JSON.stringify({version:1,workId:row.id,mediaFingerprint:mediaFingerprint(row),duration:4,assets}));
  fs.mkdirSync(path.join(directory,'media'));fs.writeFileSync(path.join(directory,'media','E01-thumb-0.png'),Buffer.from([137,80,78,71,13,10,26,10,0]));
  fs.writeFileSync(path.join(directory,'preview-manifest.json'),JSON.stringify({version:2,drafts:[{id:row.id,label:'E01',sourceVersion:{mediaMetadataSha256:mediaFingerprint(row)}}]}));
  try{
    // 150,000 bytes encode to 200,000 base64 characters; only the still fits 250,000.
    const partial=await localVisuals(directory,row,{detail:'study',budget:250_000});
    assert.deepEqual(partial.images.map(image=>image.item.role),['still']);
    assert.deepEqual([partial.status,partial.truncated,partial.omitted_roles],['prepared_current_media',true,['overview']]);
    const glance=await workReply({byId:new Map([[row.id,row]]),details:()=>({id:row.id,title:'G',creator:'C',snapshot:{},preview:{}})},[row.id],{preview:'image',detail:'glance'},{loadVisuals:(r,options)=>localVisuals(directory,r,options)});
    assert.equal(JSON.parse(glance.content[0].text).preview.motion_sheets,1);
    // The raw 150,000 bytes would fit this budget; the encoded size does not, and no legacy PNG is substituted.
    const none=await localVisuals(directory,row,{detail:'glance',budget:150_000});
    assert.deepEqual([none.images.length,none.status,none.omitted_roles],[0,VISUAL_BUDGET_STATUS,['still']]);
    // Without a pack, the legacy thumbnail is still the fallback when it fits.
    assert.equal((await preparedVisuals(row,()=>null)).status,'No prepared visual pack for current media.');
    const engine={byId:new Map([[row.id,row]]),details:()=>({id:row.id,title:'Glass\nsite',creator:'A. Maker',snapshot:{},preview:{video_url:'https://media.inspora.design/a.mp4'}})};
    const reply=await workReply(engine,[row.id],{preview:'image',detail:'study'},{loadVisuals:(r,options)=>localVisuals(directory,r,options)});
    assert.deepEqual(reply.content.map(item=>item.type),['text','text','image','text','image']);
    assert.equal(reply.content[1].text,`Image 1 · Glass site by A. Maker · ${row.id} · still · t=0.5s–1.3s (2 samples)`);
    assert.deepEqual(JSON.parse(reply.content[0].text).preview.study,{available:true,sheets:1});
    assert.ok(reply.content.filter(item=>item.type==='image').reduce((sum,item)=>sum+item.data.length,0)<=VISUAL_RESPONSE_BYTES);
    fs.rmSync(manifestFile);
    const legacy=await localVisuals(directory,row,{detail:'glance',budget:150_000});
    assert.equal(legacy.status,'legacy_low_resolution_thumbnail');assert.equal(legacy.motion_sheets,undefined);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('study replies under budget prefer the still and detail sheets, dropping the duplicate overview first',async()=>{
  const row={id:'00000000-0000-4000-8000-000000000002',kind:'design',media:[{type:'video',url:'https://media.inspora.design/b.mp4',poster:'https://media.inspora.design/b.webp'}]};
  const files=new Map(),sizes={still:150_000,overview:100_000,'detail-1':150_000,'detail-2':150_000,'detail-3':150_000};
  const assets=Object.entries(sizes).map(([role,size])=>{
    const bytes=Buffer.alloc(size);bytes[0]=255;bytes[1]=216;bytes[2]=role.length;bytes[3]=role.at(-1).charCodeAt(0);
    const item={role,width:800,height:600,bytes:size,sha256:visualSha(bytes),timecodes:[1]};files.set(visualAssetKey(row,item,1),bytes);return item;
  });
  files.set(visualManifestKey(row,1),Buffer.from(JSON.stringify({version:1,workId:row.id,mediaFingerprint:mediaFingerprint(row),duration:30,assets})));
  const read=key=>files.get(key)??null,roles=pack=>pack.images.map(image=>image.item.role);
  // Encoded: still 200,000 + overview 133,336 + details 600,000 = 933,336 > 900,000; without the overview 800,000 fits.
  const sharp=await preparedVisuals(row,read,{detail:'study'});
  assert.deepEqual(roles(sharp),['still','detail-1','detail-2','detail-3']);
  assert.deepEqual([sharp.truncated,sharp.omitted_roles,sharp.overview_dropped],[true,['overview'],true]);
  const engine={byId:new Map([[row.id,row]]),details:()=>({id:row.id,title:'Motion',creator:'A',snapshot:{},preview:{video_url:'https://media.inspora.design/b.mp4'}})};
  const study=JSON.parse((await workReply(engine,[row.id],{preview:'image',detail:'study'},{loadVisuals:(r,options)=>preparedVisuals(r,read,options)})).content[0].text).preview.study;
  assert.deepEqual([study.available,study.sheets,study.partial,study.omitted_roles],[true,3,true,['overview']]);
  assert.match(study.reason,/overview sheet was omitted because the attached detail sheets cover the same frames/);
  // When even the still and every detail sheet do not fit, the overview keeps full time coverage.
  const tight=await preparedVisuals(row,read,{detail:'study',budget:700_000});
  assert.deepEqual(roles(tight),['still','overview','detail-1']);assert.deepEqual(tight.omitted_roles,['detail-2','detail-3']);
  assert.equal(tight.overview_dropped,undefined);
  // Everything fits: all roles in manifest order.
  assert.deepEqual(roles(await preparedVisuals(row,read,{detail:'study',budget:1_000_000})),Object.keys(sizes));
  // Glance is unaffected.
  const glance=await preparedVisuals(row,read,{detail:'glance'});
  assert.deepEqual(roles(glance),['still']);assert.equal(glance.motion_sheets,4);
});
