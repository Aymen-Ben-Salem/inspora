import test from 'node:test';
import assert from 'node:assert/strict';
import {localPreview} from '../preview.mjs';
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
