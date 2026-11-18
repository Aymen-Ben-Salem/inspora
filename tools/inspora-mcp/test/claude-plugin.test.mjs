import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {repoRoot,pluginRoot,pluginSkillsDir,skillDrift} from '../sync-plugin-skills.mjs';

const json=path=>JSON.parse(readFileSync(path,'utf8'));
const text=path=>readFileSync(join(repoRoot,path),'utf8');
// The hosted endpoint as the deployed Worker defines it: its custom-domain route plus the MCP API route.
const hostedEndpoint=()=>{
  const wrangler=JSON.parse(text('tools/inspora-mcp/cloudflare/wrangler.jsonc').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''));
  const route=wrangler.routes.find(r=>r.custom_domain);assert.ok(route,'wrangler.jsonc declares the custom-domain route');
  assert.match(text('tools/inspora-mcp/cloudflare/http.mjs'),/url\.pathname!=='\/mcp'/,'the Worker serves MCP at /mcp');
  assert.match(text('tools/inspora-mcp/cloudflare/authorization.mjs'),/apiRoute:'\/mcp'/,'OAuth protects /mcp');
  return 'https://'+route.pattern+'/mcp';
};

test('plugin skills are byte-identical copies of skills/',()=>{
  assert.deepEqual(skillDrift(),[],'run: node tools/inspora-mcp/sync-plugin-skills.mjs');
  const names=readdirSync(pluginSkillsDir);assert.ok(names.includes('inspora-discovery')&&names.includes('inspora-design-direction'));
  for(const name of names)assert.match(readFileSync(join(pluginSkillsDir,name,'SKILL.md'),'utf8'),new RegExp('^---\\r?\\nname: '+name+'\\r?\\n'),name+' frontmatter name matches its folder');
});

test('plugin manifest is valid and complete',()=>{
  const manifest=json(join(pluginRoot,'.claude-plugin','plugin.json'));
  assert.equal(manifest.name,'inspora');
  assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
  for(const field of ['description','homepage','repository'])assert.equal(typeof manifest[field],'string',field);
  assert.ok(manifest.author?.name,'author.name');new URL(manifest.homepage);
  assert.equal(manifest.mcpServers,undefined,'the MCP server is declared once, in .mcp.json');
});

test('marketplace lists the plugin by relative path without a second version',()=>{
  const market=json(join(repoRoot,'.claude-plugin','marketplace.json')),manifest=json(join(pluginRoot,'.claude-plugin','plugin.json'));
  assert.match(market.name,/^[a-z0-9][a-z0-9-]*$/);assert.ok(market.owner?.name);
  assert.deepEqual(market.plugins.map(p=>[p.name,p.source]),[[manifest.name,'./plugins/inspora']]);
  assert.equal(market.plugins[0].version,undefined,'plugin.json is the only version source');
});

test('the bundled MCP server is the hosted team endpoint over HTTP with no credentials',()=>{
  const {mcpServers}=json(join(pluginRoot,'.mcp.json')),endpoint=hostedEndpoint();
  assert.equal(endpoint,'https://mcp.inspora.design/mcp');
  assert.deepEqual(mcpServers,{inspora:{type:'http',url:endpoint}},'OAuth is handled by the client; no headers or tokens in the plugin');
  assert.ok(text('tools/inspora-mcp/cloudflare/setup.html').includes(endpoint),'setup page documents the same endpoint');
});

// Codex reads the portable Agent Plugins files (root plugin.json, mcp.json) and .agents/plugins/marketplace.json;
// Claude Code reads .claude-plugin/ and .mcp.json. Both must describe the same plugin.
test('the Codex manifest matches the Claude Code manifest',()=>{
  const claude=json(join(pluginRoot,'.claude-plugin','plugin.json')),portable=json(join(pluginRoot,'plugin.json'));
  for(const field of ['name','version','description','homepage','repository','author','keywords'])assert.deepEqual(portable[field],claude[field],field);
  assert.equal(portable.skills,undefined,'portable plugins discover skills/ at the root');
  assert.equal(portable.extensions?.['com.openai']?.interface?.displayName,claude.displayName);
});

test('the Codex MCP file declares the same hosted endpoint as Streamable HTTP with no credentials',()=>{
  const {mcpServers}=json(join(pluginRoot,'mcp.json'));
  assert.deepEqual(mcpServers,{inspora:{type:'streamable-http',url:hostedEndpoint()}});
});

test('the Codex marketplace lists the same plugin under the same marketplace name',()=>{
  const codex=json(join(repoRoot,'.agents','plugins','marketplace.json')),claude=json(join(repoRoot,'.claude-plugin','marketplace.json'));
  assert.equal(codex.name,claude.name);
  assert.deepEqual(codex.plugins,[{name:'inspora',source:{source:'local',path:'./plugins/inspora'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Design'}]);
});
