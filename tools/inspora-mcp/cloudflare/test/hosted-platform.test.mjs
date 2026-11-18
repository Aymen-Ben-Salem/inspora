// Hosted team-trial reliability: concurrency, continuation, limits, catalog updates and access.
// Migrated from the revision-9 QA tests; assertions now pin the fixed behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createWorker,teamMember,toolError} from '../http.mjs';
import {buildCatalog,publishCatalog,createCatalogReader,FENCE_KEY,POINTER_KEY,REPAIR_INTERVAL_MS} from '../catalog.mjs';
import {CatalogSync,PENDING_RETRY_MS} from '../synchronization.mjs';
import {AccessState,TOOL_LIMITS,CURSOR_MAX_ENTRIES,CURSOR_MAX_CHARS,packContinuation,unpackContinuation,continuationCursor} from '../access-state.mjs';
import {CURSOR_TTL_MS,SEARCH_REVISION} from '../../search.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';
import {sha} from '../../catalog.mjs';
import {Bucket,Namespace,Storage} from './helpers.mjs';

const origin='https://mcp.test';
const USERS=['alice','bob','carol','dave','erin','frank'];
const tokenFor=user=>(user+'_token_').padEnd(43,user[0]);
const decoded=result=>JSON.parse(result.content[0].text);
// Budget tests count requests within one wall-clock minute; avoid straddling a boundary.
async function freshMinute(){const s=new Date().getSeconds();if(s>48)await new Promise(r=>setTimeout(r,(61-s)*1000));}

async function fixture({rows=24,users=USERS,env:extra={}}={}) {
  const list=Array.from({length:rows},(_,i)=>({...work(i+1,i%4===0?'website':'design'),title:'Blue glass '+(i+1),description:'Blue glass panels with a geometric grid',colors:['Blue']}));
  const input={version:1,catalog:{capturedAt:new Date().toISOString(),rows:list},enrichment:{version:1,entries:list.map(row=>note(row))}};
  const index=await buildCatalog(input,{embed}),bucket=new Bucket();await publishCatalog(bucket,index);
  const env={MCP_ORIGIN:origin,ACCESS_MODE:'pilot',MCP_PILOT_TOKENS:JSON.stringify(users.map(id=>({id,sha256:sha(tokenFor(id)),expiresAt:'2099-01-01'}))),CATALOG:bucket,ACCESS_STATE:new Namespace(),AI:{run:async(_m,args)=>({data:await embed(args.text)})},...extra};
  const worker=createWorker();
  return {env,index,input,bucket,fetch:async(url,init)=>worker.fetch(new Request(url,init),env)};
}
async function clientFor(f,user){
  const transport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+tokenFor(user)}},fetch:f.fetch});
  const client=new Client({name:'qa-'+user,version:'1'});await client.connect(transport);return client;
}
const rpc=(f,user,body)=>f.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokenFor(user),'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',...body})});

test('6 concurrent users search, page, and fetch details without cross-talk',async()=>{
  await freshMinute();
  const f=await fixture();
  const clients=await Promise.all(USERS.map(user=>clientFor(f,user)));
  try{
    const runs=await Promise.all(clients.map(async(client,i)=>{
      const first=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:8}}));
      const second=decoded(await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,count:8}}));
      const details=decoded(await client.callTool({name:'get_works',arguments:{ids:first.results.slice(0,6).map(r=>r.id),preview:'none'}}));
      const one=decoded(await client.callTool({name:'get_work',arguments:{id:second.results[0].id,preview:'link'}}));
      const status=decoded(await client.callTool({name:'catalog_status',arguments:{}}));
      return {user:USERS[i],first,second,details,one,status};
    }));
    for(const run of runs){
      assert.equal(run.first.results.length,8,run.user);
      assert.equal(run.second.results.length,8,run.user);
      assert.ok(run.second.results.every(r=>!run.first.results.some(x=>x.id===r.id)),run.user+' pages overlap');
      assert.equal(run.details.works.length,6);
      assert.ok(run.one.id);
      assert.equal(run.status.search_revision,SEARCH_REVISION);
    }
    const cursors=new Set(runs.flatMap(r=>[r.first.next_cursor,r.second.next_cursor]));
    assert.equal(cursors.size,runs.length*2,'cursors must be unique across users');
    assert.equal(f.env.ACCESS_STATE.objects.size,USERS.length,'one access-state object per principal');
  }finally{await Promise.all(clients.map(c=>c.close()));}
});

test('cursor theft: another user cannot use a cursor; the owner can re-read the same page',async()=>{
  const f=await fixture();const alice=await clientFor(f,'alice'),bob=await clientFor(f,'bob');
  try{
    const first=decoded(await alice.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:5}}));
    const burst=await Promise.all(Array.from({length:5},()=>bob.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}})));
    assert.ok(burst.every(r=>r.isError&&/^CURSOR_EXPIRED: /.test(decoded(r).error)));
    const owner=decoded(await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,count:5}}));
    assert.equal(owner.results.length,5,'owner continuation must still work after theft attempts');
    const replay=decoded(await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,count:5}}));
    assert.deepEqual(replay,owner,'same cursor and page settings return the same page and next cursor');
    // A different page size is a different (still deterministic) page.
    const larger=decoded(await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,count:7}}));
    assert.deepEqual(larger.results.slice(0,5),owner.results);assert.notEqual(larger.next_cursor,owner.next_cursor);
    const changed=await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,query:'red'}});
    assert.match(decoded(changed).error,/^CURSOR_QUERY_MISMATCH: .*start a new search/);
    const bobKeys=[...f.env.ACCESS_STATE.objects.get('bob').state.storage.values.keys()].filter(k=>k.startsWith('cursor:'));
    assert.deepEqual(bobKeys,[]);
  }finally{await alice.close();await bob.close();}
});

test('same user, 5 parallel continuations of one cursor all return the same page',async()=>{
  const f=await fixture();const a=await clientFor(f,'alice');
  try{
    const first=decoded(await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:4}}));
    const replies=await Promise.all(Array.from({length:5},()=>a.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,count:4}})));
    assert.ok(replies.every(r=>!r.isError));
    for(const reply of replies)assert.deepEqual(decoded(reply),decoded(replies[0]));
    const third=decoded(await a.callTool({name:'search_inspiration',arguments:{cursor:decoded(replies[0]).next_cursor,count:4}}));
    assert.ok(third.results.every(r=>!decoded(replies[0]).results.some(x=>x.id===r.id)&&!first.results.some(x=>x.id===r.id)));
  }finally{await a.close();}
});

test('catalog updates: removed works disappear; status answers while updating or stale; errors say what to do',async()=>{
  const f=await fixture();const a=await clientFor(f,'alice'),b=await clientFor(f,'bob');
  try{
    const first=decoded(await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:5}}));
    const removed=first.results[0].id;
    f.input.catalog.rows=f.input.catalog.rows.filter(r=>r.id!==removed);f.input.catalog.capturedAt=new Date().toISOString();
    await publishCatalog(f.bucket,await buildCatalog(f.input,{embed}));
    const cont=await a.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}});
    assert.match(decoded(cont).error,/^CURSOR_EXPIRED: .*catalog changed.*Rerun the original search/);
    assert.match(decoded(await b.callTool({name:'get_work',arguments:{id:removed}})).error,/WORK_NOT_ELIGIBLE/);
    const fresh=decoded(await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:5}}));
    assert.ok(!fresh.results.some(r=>r.id===removed));
    // An admin edit was just notified: reads that could expose the edited work pause.
    const pointer=JSON.parse(f.bucket.values.get(POINTER_KEY));
    f.bucket.values.set(POINTER_KEY,JSON.stringify({...pointer,eventDriven:true,pendingWorks:0}));
    f.bucket.values.set(FENCE_KEY,JSON.stringify({pending:true,sequence:2,since:new Date().toISOString()}));
    const [status,search,detail]=await Promise.all([
      a.callTool({name:'catalog_status',arguments:{}}),
      b.callTool({name:'search_inspiration',arguments:{query:'blue glass'}}),
      b.callTool({name:'get_work',arguments:{id:fresh.results[0].id}}),
    ]);
    assert.equal(status.isError,undefined);
    const state=decoded(status);
    assert.equal(state.catalog_state,'updating');assert.ok(state.retry_after_seconds>=5&&state.retry_after_seconds<=20);
    assert.equal(state.live,false);assert.ok(state.counts.design>0);
    for(const reply of [search,detail]){
      assert.equal(reply.isError,true);
      assert.match(decoded(reply).error,/^CATALOG_UPDATING: .*Retry in ~\d+ seconds/);
      assert.equal(decoded(reply).retry_after,state.retry_after_seconds);
    }
    // A failed refresh records its next retry time, which the hint follows.
    f.bucket.values.set(FENCE_KEY,JSON.stringify({pending:true,sequence:2,since:new Date(Date.now()-600000).toISOString(),retryAt:new Date(Date.now()+45000).toISOString()}));
    assert.ok(Math.abs(decoded(await a.callTool({name:'catalog_status',arguments:{}})).retry_after_seconds-45)<=1);
    // Stale (repair overdue): status reports it; search fails closed with guidance.
    f.bucket.values.set(FENCE_KEY,JSON.stringify({pending:false,sequence:2,snapshotId:pointer.snapshotId}));
    f.bucket.values.set(POINTER_KEY,JSON.stringify({...pointer,eventDriven:true,pendingWorks:0,sourceCheckedAt:new Date(Date.now()-REPAIR_INTERVAL_MS-120000).toISOString()}));
    assert.equal(decoded(await a.callTool({name:'catalog_status',arguments:{}})).catalog_state,'stale');
    assert.match(decoded(await a.callTool({name:'search_inspiration',arguments:{query:'blue glass'}})).error,/^CATALOG_STALE: .*Retry later/);
    // No catalog at all: status still answers, without counts.
    f.bucket.values.delete(POINTER_KEY);
    const missing=decoded(await a.callTool({name:'catalog_status',arguments:{}}));
    assert.equal(missing.catalog_state,'unavailable');assert.equal(missing.counts,undefined);assert.match(missing.error,/^CATALOG_UNAVAILABLE: .*Retry/);
  }finally{await a.close();await b.close();}
});

test('rate limits: an SDK client reads a refused tool call as a tool error; protocol traffic is not counted',async()=>{
  await freshMinute();
  const f=await fixture();const a=await clientFor(f,'alice');
  try{
    for(let i=0;i<5;i++)await a.listTools();
    await a.ping();
    let calls=0,refused;
    for(;;){const reply=await a.callTool({name:'catalog_status',arguments:{}});if(reply.isError){refused=reply;break;}calls++;assert.ok(calls<=TOOL_LIMITS.minute);}
    assert.equal(calls,TOOL_LIMITS.minute,'connect, tools/list and ping must not spend the tool budget');
    const body=decoded(refused);
    assert.match(body.error,/^TOOL_LIMIT_REACHED: retry after \d+ seconds\. The per-person minute limit/);
    assert.equal(body.limit_window,'minute');assert.ok(body.retry_after>0);
    // Raw HTTP: a refused tools/call is a JSON-RPC result, not a bare 429.
    const raw=await rpc(f,'alice',{id:9,method:'tools/call',params:{name:'catalog_status',arguments:{}}});
    assert.equal(raw.status,200);assert.equal((await raw.json()).result.isError,true);
    // Other users are unaffected.
    const b=await clientFor(f,'bob');assert.equal(decoded(await b.callTool({name:'catalog_status',arguments:{}})).search_revision,SEARCH_REVISION);await b.close();
  }finally{await a.close().catch(()=>{});}
});

test('one person with three clients completes a modest research turn within the shared budget',async()=>{
  await freshMinute();
  const f=await fixture();
  const clients=await Promise.all([1,2,3].map(()=>clientFor(f,'carol')));
  try{
    const replies=(await Promise.all(clients.map(async client=>{
      await client.listTools();
      return Promise.all([
        client.callTool({name:'search_inspiration',arguments:{query:'blue glass dashboards',count:6}}),
        client.callTool({name:'search_inspiration',arguments:{query:'blue glass landing page',count:6}}),
        client.callTool({name:'get_works',arguments:{ids:[work(1).id,work(2).id],preview:'none'}}),
        client.callTool({name:'get_work',arguments:{id:work(5).id,preview:'none'}}),
        client.callTool({name:'catalog_status',arguments:{}}),
      ]);
    }))).flat();
    assert.ok(replies.every(reply=>!reply.isError||!/LIMIT/.test(decoded(reply).error)),'15 tool calls plus protocol traffic stay within the per-person budget');
    const used=await f.env.ACCESS_STATE.objects.get('carol').state.storage.get('tools');
    assert.equal(used.minuteCount,15);
  }finally{await Promise.all(clients.map(c=>c.close().catch(()=>{})));}
});

test('oversized and invalid inputs return actionable JSON errors and do not crash the worker',async()=>{
  const f=await fixture();const a=await clientFor(f,'alice');
  const cases=[
    ['search_inspiration',{query:'x'.repeat(601)},/^INVALID_INPUT: query: Too big.*600.*Fix the arguments/],
    ['search_inspiration',{query:'blue glass',count:21},/^INVALID_INPUT: count: Too big/],
    ['search_inspiration',{query:'blue glass',kinds:['video']},/^INVALID_INPUT: kinds\.0: /],
    ['search_inspiration',{query:'blue glass',limit:5},/^INVALID_INPUT: arguments: Unrecognized key: "limit"/],
    ['search_inspiration',{query:'blue glass',reference_url:'https://www.inspora.design/designs/x'},/^INPUT: /],
    ['search_inspiration',{cursor:'abc'},/^INVALID_INPUT: cursor: /],
    ['search_inspiration',{cursor:'A'.repeat(32)},/^CURSOR_EXPIRED: /],
    ['get_work',{id:'not-a-uuid'},/^INVALID_INPUT: id: /],
    ['get_works',{ids:Array.from({length:7},(_,i)=>work(i+1).id)},/^INVALID_INPUT: ids: Too big/],
    ['get_works',{ids:[work(1).id,work(1).id]},/^INVALID_INPUT: ids: Use unique work IDs/],
    ['get_works',{ids:[work(1).id],detail:'deep'},/^INVALID_INPUT: detail: /],
    ['catalog_status',{verbose:true},/^INVALID_INPUT: arguments: Unrecognized key/],
    ['delete_everything',{},/^INVALID_INPUT: .*not found.*tools\/list/],
  ];
  try{
    for(const [name,args,expected] of cases){
      const reply=await a.callTool({name,arguments:args});
      assert.equal(reply.isError,true,name+' '+JSON.stringify(args).slice(0,60));
      assert.match(decoded(reply).error,expected);
    }
    const big=await f.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokenFor('alice'),'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_inspiration',arguments:{query:'x'.repeat(17000)}}})});
    assert.equal(big.status,413);
    assert.equal(decoded(await a.callTool({name:'catalog_status',arguments:{}})).search_revision,SEARCH_REVISION);
  }finally{await a.close();}
});

test('expired pilot token and default ACCESS_MODE keep the endpoint closed',async()=>{
  const f=await fixture();
  const post=(env,token)=>createWorker().fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}),env);
  const expired={...f.env,MCP_PILOT_TOKENS:JSON.stringify([{id:'alice',sha256:sha(tokenFor('alice')),expiresAt:'2020-01-01'}])};
  assert.equal((await post(expired,tokenFor('alice'))).status,401);
  for(const mode of [undefined,'disabled','oauth','PILOT','public'])assert.equal((await post({...f.env,ACCESS_MODE:mode},tokenFor('alice'))).status,401,'ACCESS_MODE='+mode);
  assert.equal((await post({...f.env,MCP_ACCESS_POLICY:'public'},tokenFor('alice'))).status,503);
  assert.equal((await post({...f.env,MCP_ORIGIN:undefined},tokenFor('alice'))).status,404);
});

test('hosted error codes keep their prefix and add the next step',()=>{
  const expected={
    CURSOR_EXPIRED:/Rerun the original search/,CURSOR_INVALID:/Rerun the search/,CURSOR_QUERY_MISMATCH:/start a new search/,
    CATALOG_UPDATING:/Retry in ~12 seconds/,CATALOG_STALE:/Retry later/,CATALOG_UNAVAILABLE:/Retry in about a minute/,
    CATALOG_INTEGRITY:/Retry later and tell the Inspora team/,CATALOG_MODEL_MISMATCH:/tell the Inspora team/,
    RESPONSE_BUDGET:/smaller count, format=links or include_reason=false/,DETAIL_BUDGET:/preview=link or preview=none/,
  };
  for(const [code,step] of Object.entries(expected)){
    const message=toolError(Object.assign(Error(code+(code==='RESPONSE_BUDGET'?': one result exceeds the configured response bound':'')),{retryAfter:12}));
    assert.ok(message.startsWith(code+': '),message);assert.match(message,step);
  }
  assert.match(toolError(Error('WORK_NOT_ELIGIBLE: work absent from this dated catalog')),/^WORK_NOT_ELIGIBLE: work absent/);
  assert.equal(toolError(Error('private provider failure')),'SERVICE_UNAVAILABLE: retry later');
});

test('optional TEAM_USER_IDS allowlist is checked on every authenticated call',async()=>{
  assert.equal(teamMember('user_a',{}),true);assert.equal(teamMember('user_a',{TEAM_USER_IDS:'  '}),true);
  assert.equal(teamMember('user_a',{TEAM_USER_IDS:'user_b, user_a'}),true);assert.equal(teamMember('user_c',{TEAM_USER_IDS:'user_b,user_a'}),false);
  for(const broken of [',',' , ','user_a,bad id','user_a;user_b'])assert.equal(teamMember('user_a',{TEAM_USER_IDS:broken}),null,broken);
  const f=await fixture({env:{TEAM_USER_IDS:'alice'}});
  const alice=await clientFor(f,'alice');
  assert.equal(decoded(await alice.callTool({name:'catalog_status',arguments:{}})).catalog_state,'ready');
  const denied=await rpc(f,'bob',{id:1,method:'tools/list'});
  assert.equal(denied.status,403);assert.match((await denied.json()).error,/^TEAM_ACCESS_REQUIRED: .*Ask the Inspora team/);
  assert.equal(f.env.ACCESS_STATE.objects.has('bob'),false,'non-members never reach per-user state');
  // Offboarding takes effect on the next call, even for an existing connection.
  f.env.TEAM_USER_IDS='carol';
  await assert.rejects(alice.callTool({name:'catalog_status',arguments:{}}),/403|TEAM_ACCESS_REQUIRED/);
  f.env.TEAM_USER_IDS='alice,not valid';
  assert.equal((await rpc(f,'alice',{id:2,method:'tools/list'})).status,503);
  await alice.close().catch(()=>{});
});

test('structured output: search_inspiration and catalog_status declare and validate outputSchema',async()=>{
  const f=await fixture();const a=await clientFor(f,'alice');
  try{
    const {tools}=await a.listTools();
    const byName=Object.fromEntries(tools.map(tool=>[tool.name,tool]));
    assert.equal(byName.search_inspiration.outputSchema.type,'object');assert.ok(byName.search_inspiration.outputSchema.required.includes('results'));
    assert.ok(byName.catalog_status.outputSchema.properties.catalog_state);
    assert.equal(byName.get_work.outputSchema,undefined,'image tools keep content-only results');
    assert.ok(byName.get_works.inputSchema.properties.detail,'get_works accepts detail');
    for(const tool of ['get_work','get_works','search_inspiration'])for(const [name,schema] of Object.entries(byName[tool].inputSchema.properties))assert.ok(schema.description,tool+'.'+name+' is described');
    // The SDK client validates structuredContent against the declared schema.
    const search=await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:3}});
    assert.equal(search.content[0].type,'text');assert.deepEqual(search.structuredContent,decoded(search));
    const status=await a.callTool({name:'catalog_status',arguments:{}});
    assert.deepEqual(status.structuredContent,decoded(status));assert.equal(status.structuredContent.catalog_state,'ready');
    const error=await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:21}});
    assert.equal(error.isError,true);assert.equal(error.structuredContent,undefined);
  }finally{await a.close();}
});

test('minimal observability logs only tool, outcome and duration when enabled',async()=>{
  const f=await fixture({env:{MCP_OBSERVABILITY:'minimal'}});const a=await clientFor(f,'alice');
  const lines=[],log=console.log;console.log=line=>lines.push(line);
  try{
    await a.callTool({name:'search_inspiration',arguments:{query:'blue glass secret brief',count:2}});
    await a.callTool({name:'get_work',arguments:{id:work(999).id}});
  }finally{console.log=log;await a.close();}
  const events=lines.map(line=>JSON.parse(line));
  assert.deepEqual(events.map(({event,tool,outcome})=>[event,tool,outcome]),[['mcp_tool','search_inspiration','ok'],['mcp_tool','get_work','WORK_NOT_ELIGIBLE']]);
  assert.ok(events.every(event=>Object.keys(event).sort().join()==='event,ms,outcome,tool'));
  assert.ok(!lines.join('').includes('secret')&&!lines.join('').includes('alice'));
});

test('large catalog: broad continuation stays bounded and never fails with CURSOR_INVALID',async()=>{
  const f=await fixture({rows:5000,users:['alice']});const a=await clientFor(f,'alice');
  try{
    const first=await a.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:10}});
    assert.equal(first.isError,undefined,JSON.stringify(first.content[0].text).slice(0,200));
    assert.equal(decoded(first).search_coverage.matching_works,5000);
    const stored=[...f.env.ACCESS_STATE.objects.get('alice').state.storage.values].find(([key])=>key.startsWith('cursor:'))[1];
    assert.ok(JSON.stringify(stored).length<CURSOR_MAX_CHARS/2);assert.equal(stored.limited,true);assert.equal(stored.entries.length,1000);
    const next=decoded(await a.callTool({name:'search_inspiration',arguments:{cursor:decoded(first).next_cursor,count:10}}));
    assert.equal(next.results.length,10);assert.ok(next.results.every(r=>!decoded(first).results.some(x=>x.id===r.id)));
  }finally{await a.close();}
});

test('continuation packing keeps ids, labels and order; the cap ends honestly',()=>{
  const ranked=Array.from({length:12},(_,i)=>({id:'w'+i,match:i%2?'alternative':'candidate',reason:'Catalog terms: blue.'+(i>9?' Extra.':''),fit:i<3?'full':'partial'}));
  const state={query:{query:'blue'},ranked,offset:2,expires:1,snapshotId:'s',searchRevision:SEARCH_REVISION,interpreted:{},coverage:{}};
  const packed=packContinuation(state,5);
  assert.equal(packed.ranked,undefined);assert.deepEqual(packed.entries.map(([id])=>id),['w2','w3','w4','w5','w6']);
  assert.ok(packed.labels.length<packed.entries.length,'labels are deduplicated');assert.equal(packed.limited,true);
  const restored=unpackContinuation(packed);
  assert.deepEqual(restored.ranked,ranked.slice(2,7));assert.equal(restored.offset,0);assert.deepEqual(restored.query,state.query);
  assert.equal(packContinuation({...state,offset:8},5).limited,false);
  assert.equal(packContinuation({...restored,offset:1},5).limited,true,'a capped continuation stays capped');
  const long=packContinuation({...state,ranked:[{id:'x',match:'candidate',reason:'r'.repeat(900)}],offset:0});
  assert.equal(long.labels[0].reason.length,220,'stored reasons match the displayed 220-character bound');
  const args={count:10,format:'compact',include_reason:true};
  assert.equal(continuationCursor('c'.repeat(32),args),continuationCursor('c'.repeat(32),{...args}));
  assert.notEqual(continuationCursor('c'.repeat(32),args),continuationCursor('c'.repeat(32),{...args,count:5}));
  assert.match(continuationCursor('c'.repeat(32),args),/^[A-Za-z0-9_-]{32}$/);
});

test('cursor and receipt caps evict the entry that expires first',async()=>{
  const storage=new Storage(),object=new AccessState({storage}),now=Date.now();
  const call=body=>object.fetch(new Request('https://state.internal/',{method:'POST',body:JSON.stringify(body)}));
  const value=expires=>({entries:[['w',0]],labels:[{match:'candidate'}],expires,query:{},searchRevision:SEARCH_REVISION,snapshotId:'s'});
  for(let i=0;i<CURSOR_MAX_ENTRIES;i++)storage.values.set('cursor:'+String(i).padStart(32,'0'),value(now+CURSOR_TTL_MS-(i===7?600000:i===3?1:0)-1000));
  storage.values.set('cursor:'+'x'.repeat(32),value(now-1));
  assert.equal((await call({action:'put',cursor:'n'.repeat(32),value:value(now+CURSOR_TTL_MS-10)})).status,200);
  const keys=[...storage.values.keys()].filter(key=>key.startsWith('cursor:'));
  assert.equal(keys.length,CURSOR_MAX_ENTRIES);
  assert.ok(!keys.includes('cursor:'+String(7).padStart(32,'0')),'earliest expiry evicted');
  assert.ok(keys.includes('cursor:'+String(3).padStart(32,'0'))&&keys.includes('cursor:'+String(0).padStart(32,'0')));
  assert.ok(!keys.includes('cursor:'+'x'.repeat(32)),'expired entries are pruned');
  // Overwriting an existing cursor (an idempotent re-read) evicts nothing.
  assert.equal((await call({action:'put',cursor:'n'.repeat(32),value:value(now+CURSOR_TTL_MS-10)})).status,200);
  assert.equal([...storage.values.keys()].filter(key=>key.startsWith('cursor:')).length,CURSOR_MAX_ENTRIES);
  // Pre-upgrade single-use entries are treated as expired, not misread.
  storage.values.set('cursor:'+'o'.repeat(32),{consumed:true,expires:now+60000,searchRevision:SEARCH_REVISION,snapshotId:'s'});
  const old=await call({action:'take',args:{cursor:'o'.repeat(32)},snapshotId:'s'});
  assert.equal(old.status,409);assert.equal((await old.json()).error,'CURSOR_EXPIRED');
});

test('catalog sync: the fence lifts only after a build covers the latest edit; work is kept and failures retry fast',async()=>{
  const bucket=new Bucket(),storage=new Storage();
  let rows=[work(1),work(2),work(3)],editDuringBuild=false,failSource=false,embeddings=0;
  const feed=()=>({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(r=>note(r))}});
  await publishCatalog(bucket,await buildCatalog(feed(),{embed}));
  const job=new CatalogSync({storage,blockConcurrencyWhile:fn=>fn()},{CATALOG:bucket},{readSource:async()=>{if(failSource)throw Error('SOURCE_HTTP_503');const s=feed();if(editDuringBuild)await enqueue();return s;},embed:async texts=>{embeddings+=texts.length;return embed(texts);}});
  const enqueue=()=>job.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'enqueue',reason:'edit'})}));
  const fence=()=>JSON.parse(bucket.values.get(FENCE_KEY));
  const alarm=async()=>{storage.alarmAt=null;await job.alarm();};
  await enqueue();await alarm();assert.equal(fence().pending,false,'first managed publication');
  editDuringBuild=true;await enqueue();
  const since=fence().since;assert.ok(Date.parse(since)<=Date.now());
  // Correctness first: while each source read may predate a newer edit, reads stay fenced.
  for(let i=0;i<3;i++){await alarm();assert.equal(fence().pending,true);assert.equal(fence().since,since,'pending since the first unapplied edit');}
  await assert.rejects(createCatalogReader()(bucket),/CATALOG_UPDATING/);
  const status=await createCatalogReader()(bucket,{status:true});
  assert.equal(status.delivery.state,'updating');assert.ok(status.delivery.retry_after_seconds>=5);
  editDuringBuild=false;await alarm();
  assert.equal(fence().pending,false);assert.equal(await storage.get('pendingSince'),undefined);
  assert.equal((await createCatalogReader()(bucket)).delivery.state,'ready');
  // A newer edit during embedding no longer discards the computed vectors.
  rows=[...rows,work(4)];
  job.readSource=async()=>{if(failSource)throw Error('SOURCE_HTTP_503');return feed();};
  const embed2=job.embed;job.embed=async texts=>{await enqueue();return embed2(texts);};
  embeddings=0;await enqueue();await alarm();
  assert.equal(embeddings,1);assert.equal(fence().pending,true);
  const published=JSON.parse(bucket.values.get(POINTER_KEY));
  const index=JSON.parse(bucket.values.get(published.objectKey));
  assert.ok(index.rows.some(row=>row.id===work(4).id),'the embedded index is published (still fenced)');
  job.embed=embed2;embeddings=0;await alarm();
  assert.equal(embeddings,0,'the next run reuses the vectors');assert.equal(fence().pending,false);
  // While an edit is pending, a failing source retries within a minute and the fence says when.
  failSource=true;await enqueue();await alarm();
  assert.ok(storage.alarmAt<=Date.now()+PENDING_RETRY_MS);
  assert.ok(Date.parse(fence().retryAt)>=Date.now()&&Date.parse(fence().retryAt)<=Date.now()+PENDING_RETRY_MS);
  for(let i=0;i<5;i++)await alarm();
  assert.ok(storage.alarmAt<=Date.now()+PENDING_RETRY_MS,'backoff stays short while reads are fenced');
  failSource=false;await alarm();assert.equal(fence().pending,false);
  // Without a pending edit, failures keep the long backoff.
  failSource=true;for(let i=0;i<4;i++)await alarm();
  assert.ok(storage.alarmAt>Date.now()+PENDING_RETRY_MS);
});
