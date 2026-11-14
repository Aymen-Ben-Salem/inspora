import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneIndexes,RETENTION_MS} from '../retention.mjs';

test('bounded retention preserves the current index and recent versions and continues a paged sweep',async()=>{
  const prefix='mcp/hosted/v1/indexes/',key=letter=>prefix+letter.repeat(64)+'.json',now=Date.now();let deleted;
  const bucket={list:async options=>{
    assert.deepEqual(options,{prefix,limit:100,cursor:'previous-page'});
    return {truncated:true,cursor:'next-page',objects:[
      {key:key('a'),uploaded:new Date(now-RETENTION_MS-1)},
      {key:key('b'),uploaded:new Date(now-RETENTION_MS-1)},
      {key:key('c'),uploaded:new Date(now)},
      {key:'mcp/hosted/v1/current.json',uploaded:new Date(0)}
    ]};
  },delete:async keys=>{deleted=keys;}};
  assert.equal(await pruneIndexes(bucket,key('a'),'previous-page',now),'next-page');
  assert.deepEqual(deleted,[key('b')]);
});
