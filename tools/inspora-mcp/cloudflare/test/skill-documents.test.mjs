import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSkillDocuments} from '../skill-documents.mjs';
const names=['inspora-discovery','inspora-design-direction'];
const sources=names.map(name=>fs.readFileSync(new URL('../../../../skills/'+name+'/SKILL.md',import.meta.url),'utf8'));
const setup=fs.readFileSync(new URL('../setup.html',import.meta.url),'utf8');
const documents=createSkillDocuments(sources,setup);
const get=(path,options)=>documents(new Request('https://mcp.inspora.design'+path,options));

test('both discovery protocols serve exactly the two bundled skills',async()=>{
 for(const prefix of ['/.well-known/agent-skills','/.well-known/skills']){
  const response=get(prefix+'/index.json');assert.equal(response.status,200);
  const index=await response.json();assert.deepEqual(index.skills.map(x=>x.name),names);
  for(const [i,entry] of index.skills.entries()){
   assert.deepEqual(entry.files,['SKILL.md']);assert.ok(entry.description);
   assert.equal(await get(prefix+'/'+entry.name+'/SKILL.md').text(),sources[i]);
  }
 }
});
test('documents are cacheable and support HEAD and conditional GET',async()=>{
 const path='/.well-known/agent-skills/index.json';const response=get(path);
 assert.match(response.headers.get('cache-control'),/max-age=300/);
 const head=get(path,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('etag'),response.headers.get('etag'));
 const unchanged=get(path,{headers:{'If-None-Match':response.headers.get('etag')}});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
});
test('document routing never catches MCP, authorization or arbitrary source paths',()=>{
 for(const path of ['/mcp','/authorize','/internal/catalog','/worker.mjs','/.well-known/agent-skills/inspora-discovery/secret.env'])assert.equal(get(path),null);
 assert.equal(get('/setup?unexpected=1').status,404);
 assert.equal(get('/setup',{method:'POST'}).status,405);
});
test('setup guide installs the plugin in Claude Code and Codex and keeps a manual path for other agents',async()=>{
 const response=get('/setup');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
 const html=await response.text();
 // Short owner/repo form: slash commands inside Claude Code, with the terminal form beside them.
 assert.match(html,/\/plugin marketplace add inspora-design\/inspora-plugin\n\/plugin install inspora@inspora-team/);
 assert.match(html,/claude plugin marketplace add inspora-design\/inspora-plugin/);assert.match(html,/claude plugin install inspora@inspora-team/);
 assert.match(html,/codex plugin marketplace add inspora-design\/inspora-plugin\n/);assert.match(html,/codex plugin add inspora@inspora-team/);
 assert.doesNotMatch(html,/github\.com\/inspora-design\/inspora-plugin\.git/);
 // The plugin installs from the company organization; no personal GitHub identity appears.
 assert.doesNotMatch(html,/Aymen|github\.com\/Aymen/i);
 for(const client of ['claude-code','codex'])assert.match(html,new RegExp('npx skills remove inspora-discovery inspora-design-direction -g -a '+client+' -y'));
 assert.match(html,/claude mcp remove inspora -s user/);assert.match(html,/codex mcp remove inspora/);assert.match(html,/codex mcp login inspora/);
 assert.match(html,/npx skills add https:\/\/mcp\.inspora\.design -g --agent &lt;installer-id&gt; -y/);
 assert.match(html,/deferred to the future backlog/);assert.doesNotMatch(html,/planned for Phase 2/);
 assert.match(html,/npx\.cmd/);assert.match(html,/catalog_status/);
});
