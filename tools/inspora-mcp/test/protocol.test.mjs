import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {eligible} from '../catalog.mjs';
import {localPreview} from '../preview.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real stdio MCP discovers retrieval tools, searches, continues and fetches a bounded preview',async()=>{
 const index=JSON.parse(fs.readFileSync(path.join(dir,'data/index-enriched.json'),'utf8'));
 const rows=index.rows.filter(r=>eligible(r));
 const manifestFile=path.join(dir,'data/preview-manifest.json');
 const manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{drafts:[]};
 const imageRow=rows.find(r=>localPreview(r,manifest,path.join(dir,'data/media')).bytes);
 const client=new Client({name:'inspora-focused-test',version:'1.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(dir,'server.mjs'),'--ranking','hybrid'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP},stderr:'pipe'});
 await client.connect(transport);
 try {
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(x=>x.name).sort(),['catalog_status','get_work','search_inspiration']);
  assert.ok(tools.every(t=>t.annotations.readOnlyHint&&!t.annotations.destructiveHint));
  const status=JSON.parse((await client.callTool({name:'catalog_status',arguments:{}})).content[0].text);
  assert.equal(status.live,false);
  assert.equal(status.variant,'enriched');
  assert.deepEqual(status.enrichment,index.enrichment);
  assert.equal(Object.values(status.counts).reduce((s,v)=>s+v,0),rows.length);
  const call=await client.callTool({name:'search_inspiration',arguments:{query:'minimal geometric app icons',count:6}});
  assert.ok(!call.isError,JSON.stringify(call));assert.ok(JSON.stringify(call).length<15000);
  const first=JSON.parse(call.content[0].text);
  assert.ok(first.results.length>0);assert.ok(first.results.every(x=>x.kind==='icon'));
  if(first.next_cursor){
   const next=JSON.parse((await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}})).content[0].text);
   assert.ok(next.results.every(x=>!first.results.some(y=>y.id===x.id)));
  }
  const detail=await client.callTool({name:'get_work',arguments:{id:(imageRow||rows[0]).id,preview:'image'}});
  assert.ok(!detail.isError);
  if(imageRow){assert.equal(detail.content[1].type,'image');assert.ok(Buffer.from(detail.content[1].data,'base64').length<=256000);}
  else {assert.equal(detail.content.length,1);assert.match(JSON.parse(detail.content[0].text).preview.inline_status,/URL only/);}
  const bad=await client.callTool({name:'search_inspiration',arguments:{query:'blue',count:21}});
  assert.equal(bad.isError,true);
 } finally {await client.close();}
});
