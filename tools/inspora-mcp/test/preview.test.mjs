import test from 'node:test';
import assert from 'node:assert/strict';
import {localPreview} from '../preview.mjs';
import {sha} from '../catalog.mjs';

test('changed media and unsafe evidence labels cannot return an old local image', () => {
  const row={id:'work',media:[{url:'https://media.inspora.design/new.png'}]};
  const draft={id:'work',label:'D01',sourceVersion:{mediaMetadataSha256:sha([{url:'https://media.inspora.design/old.png'}])}};
  assert.match(localPreview(row,{drafts:[draft]},'.').status,/stale/);
  draft.sourceVersion.mediaMetadataSha256=sha(row.media);
  draft.label='../private';
  assert.match(localPreview(row,{drafts:[draft]},'.').status,/No locally prepared/);
});
