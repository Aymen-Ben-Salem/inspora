import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../http.mjs';
import {buildCatalog,publishCatalog} from '../catalog.mjs';
import {TOOL_LIMITS} from '../access-state.mjs';
import {accountView} from '../pro-accounting.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';
import {sha} from '../../catalog.mjs';
import {Bucket,Namespace} from './helpers.mjs';

const origin='https://mcp.test',token='pro_token_'.padEnd(43,'a'),accountingToken='acct_'.padEnd(43,'z');

test('management links support loopback fixtures while rejecting unsafe origins and embedded credentials',()=>{
  assert.equal(accountView({access:'pro',manage_url:'http://localhost:3391/account/pro'}).manage_url,'http://localhost:3391/account/pro');
  for(const value of ['http://evil.test/account/pro','https://user:secret@site.test/account/pro','https://site.test/account/pro?token=private','javascript:alert(1)'])assert.equal(accountView({access:'pro',manage_url:value}).manage_url,'https://www.inspora.design/account/pro');
});

// In-memory stand-in for the website's private accounting contract (test fixture only).
function fakeAccounting({balance=5,access='pro',reason}={}){
  const ledger={balance,access,reason,reservations:new Map(),calls:[],down:false};
  ledger.fetch=async(url,init)=>{
    assert.equal(url,'https://site.test/api/internal/pro/mcp-usage');
    assert.equal(init.headers.Authorization,'Bearer '+accountingToken);
    if(ledger.down)throw Error('network');
    const body=JSON.parse(init.body);ledger.calls.push(body.action);
    const view={included:ledger.balance,purchased:0,available:ledger.balance};
    const manage='https://site.test/account/pro';
    if(ledger.access==='trial')return Response.json(body.action==='complete'?{state:'nonbillable'}:{access:'trial'});
    if(ledger.access==='denied')return Response.json({access:'denied',reason:ledger.reason,manage_url:manage,balance:view});
    if(body.action==='access')return Response.json({access:'pro',balance:view,manage_url:manage});
    if(body.action==='reserve'){
      const existing=ledger.reservations.get(body.operationKey);
      if(existing==='settled')return Response.json({access:'pro',state:'replayed',balance:view,manage_url:manage});
      if(existing==='reserved')return Response.json({access:'pro',state:'in_progress',balance:view,manage_url:manage});
      if(ledger.balance<1)return Response.json({access:'denied',reason:'insufficient_credits',recharge_pending:false,manage_url:manage,balance:view});
      ledger.balance--;ledger.reservations.set(body.operationKey,'reserved');
      return Response.json({access:'pro',state:'reserved',balance:{...view,available:ledger.balance},manage_url:manage});
    }
    const state=ledger.reservations.get(body.operationKey);
    if(state!=='reserved')return Response.json({state:state??'missing',balance:view});
    if(body.resultCount>0){ledger.reservations.set(body.operationKey,'settled');return Response.json({state:'settled',balance:view});}
    ledger.balance++;ledger.reservations.set(body.operationKey,'released');
    return Response.json({state:'released',balance:{...view,available:ledger.balance}});
  };
  return ledger;
}

async function setup(accountingOptions){
  const rows=Array.from({length:12},(_,i)=>({...work(i+1,'design'),title:'Blue glass '+(i+1),description:'Blue glass panels with a geometric grid',colors:['Blue']}));
  const index=await buildCatalog({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(row=>note(row))}},{embed}),bucket=new Bucket();
  await publishCatalog(bucket,index);
  let embeddings=0;
  const accounting=fakeAccounting(accountingOptions);
  const env={MCP_ORIGIN:origin,ACCESS_MODE:'pilot',MCP_ACCESS_POLICY:'pro',PRO_ACCOUNTING_URL:'https://site.test/api/internal/pro/mcp-usage',PRO_ACCOUNTING_TOKEN:accountingToken,MCP_PILOT_TOKENS:JSON.stringify([{id:'user_alice1',sha256:sha(token),expiresAt:'2099-01-01'}]),CATALOG:bucket,ACCESS_STATE:new Namespace(),AI:{run:async(_model,args)=>{embeddings++;return {data:await embed(args.text)};}}};
  const worker=createWorker({accountingFetch:accounting.fetch});
  const client=async()=>{
    const init=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'pro-test',version:'1'}}})}),env);
    const sessionId=init.headers.get('mcp-session-id');
    assert.ok(sessionId);
    return async(id,name,args={})=>{
    const response=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18','Mcp-Session-Id':sessionId},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})}),env);
    const body=await response.json();
    const result=body.result;
    return {status:response.status,error:result?.isError?JSON.parse(result.content[0].text).error:null,data:result&&!result.isError?JSON.parse(result.content[0].text):null};
    };
  };
  const rpc=await client();
  return {env,worker,rpc,client,accounting,embeddings:()=>embeddings,index};
}

test('customer policy fails closed without a configured accounting boundary',async()=>{
  const {env,worker}=await setup();
  delete env.PRO_ACCOUNTING_URL;
  const response=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'}),env);
  assert.equal(response.status,503);
  env.PRO_ACCOUNTING_URL='http://site.test/api/internal/pro/mcp-usage';
  assert.equal((await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'}),env)).status,503);
});

test('a fresh nonempty search reserves and settles one credit; a replay returns the receipt without a second charge',async()=>{
  const {rpc,accounting}=await setup({balance:5});
  const first=await rpc(7,'search_inspiration',{query:'blue glass grid',count:3});
  assert.ok(first.data.results.length>0);
  assert.deepEqual(first.data.account,{access:'pro',credits_charged:1,credits_available:4,manage_url:'https://site.test/account/pro'});
  const replay=await rpc(7,'search_inspiration',{query:'blue glass grid',count:3});
  assert.equal(replay.data.replayed,true);assert.equal(accounting.balance,4);
  assert.deepEqual(accounting.calls,['access','reserve','complete','access']);
  // A deliberately new identical search (new request id) is a new billable operation.
  await rpc(8,'search_inspiration',{query:'blue glass grid',count:3});
  assert.equal(accounting.balance,3);
  const laterReplay=await rpc(7,'search_inspiration',{query:'blue glass grid',count:3});
  assert.equal(laterReplay.data.account.credits_available,3);
  assert.equal(laterReplay.data.account.credits_charged,0);
});

test('continuation and details are free but still require current entitlement',async()=>{
  const {rpc,accounting}=await setup({balance:5});
  const first=await rpc(1,'search_inspiration',{query:'blue glass grid',count:2});
  assert.ok(first.data.next_cursor);
  const next=await rpc(2,'search_inspiration',{cursor:first.data.next_cursor,count:2});
  assert.ok(next.data.results.length>0);
  await rpc(3,'get_work',{id:first.data.results[0].id});
  assert.equal(accounting.balance,4);
  assert.deepEqual(accounting.calls,['access','reserve','complete','access','access']);
  accounting.access='denied';accounting.reason='no_active_subscription';
  const refused=await rpc(4,'get_work',{id:first.data.results[0].id});
  assert.match(refused.error,/^PRO_REQUIRED: .*https:\/\/site\.test\/account\/pro/);
});

test('empty results release the credit and exhausted accounts are refused before search work',async()=>{
  const {rpc,accounting,embeddings}=await setup({balance:1});
  const empty=await rpc(1,'search_inspiration',{query:'blue glass grid',filters:{colors:['Purple']},count:3});
  assert.equal(empty.data.results.length,0);
  assert.equal(empty.data.account.credits_charged,0);assert.equal(accounting.balance,1);
  await rpc(2,'search_inspiration',{query:'blue glass grid',count:3});
  const before=embeddings();
  const refused=await rpc(3,'search_inspiration',{query:'another blue grid',count:3});
  assert.match(refused.error,/^CREDITS_EXHAUSTED: /);assert.equal(embeddings(),before);
});

test('inactive and disputed accounts get minimal guidance; status stays available without charge',async()=>{
  const {rpc,accounting}=await setup({access:'denied',reason:'payment_review'});
  assert.match((await rpc(1,'search_inspiration',{query:'blue glass'})).error,/^PAYMENT_REVIEW: /);
  const status=await rpc(2,'catalog_status');
  assert.deepEqual(status.data.account,{access:'inactive',reason:'payment_review',credits_available:5,manage_url:'https://site.test/account/pro'});
  assert.ok(!JSON.stringify(status.data).includes(accountingToken));
  assert.deepEqual(accounting.calls,['access','access']);
});

test('the team trial stays nonbillable through the same boundary',async()=>{
  const {rpc,accounting}=await setup({access:'trial'});
  const result=await rpc(1,'search_inspiration',{query:'blue glass grid',count:2});
  assert.ok(result.data.results.length>0);assert.equal(result.data.account,undefined);
  assert.deepEqual(accounting.calls,['access','reserve']);
});

test('tool-call limits refuse with retry timing before accounting or search, consuming nothing',async()=>{
  const {rpc,accounting}=await setup({balance:100});
  for(let i=0;i<TOOL_LIMITS.minute;i++)assert.equal((await rpc(i+1,'catalog_status')).error,null);
  const calls=accounting.calls.length;
  const refused=await rpc(99,'search_inspiration',{query:'blue glass'});
  assert.match(refused.error,/^TOOL_LIMIT_REACHED: retry after \d+ seconds/);
  assert.equal(accounting.calls.length,calls);assert.equal(accounting.balance,100);
});

test('accounting outages fail closed without running a search',async()=>{
  const {rpc,accounting,embeddings}=await setup({balance:5});
  accounting.down=true;
  const refused=await rpc(1,'search_inspiration',{query:'blue glass'});
  assert.match(refused.error,/^ACCOUNTING_UNAVAILABLE/);assert.equal(embeddings(),0);
});

test('two client sessions may reuse a request id for distinct, billable searches',async()=>{
  const {rpc,client,accounting}=await setup({balance:5});
  const secondClient=await client();
  await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  await secondClient(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.equal(accounting.balance,3);
});

test('a cached retry cannot bypass a new payment-review suspension',async()=>{
  const {rpc,accounting}=await setup({balance:5});
  await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  accounting.access='denied';accounting.reason='payment_review';
  const replay=await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.match(replay.error,/^PAYMENT_REVIEW/);
  assert.equal(accounting.balance,4);
});

test('a lost settlement response reconciles the saved result without another charge or search',async()=>{
  const {rpc,accounting,embeddings,worker}=await setup({balance:5});
  const original=accounting.fetch;
  let lose=true;
  // Change the supplied fetch implementation through a new Worker sharing the same state.
  const lossWorker=createWorker({accountingFetch:async(...args)=>{
    const response=await original(...args);
    if(lose&&JSON.parse(args[1].body).action==='complete'){lose=false;throw Error('response lost');}
    return response;
  }});
  // The helper's Worker remains ordinary; temporarily forward its request handling.
  const ordinary=worker.fetch;
  worker.fetch=(...args)=>lossWorker.fetch(...args);
  const first=await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.match(first.error,/^ACCOUNTING_UNAVAILABLE/);
  assert.equal(accounting.balance,4);
  const before=embeddings();
  const replay=await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.ok(replay.data.results.length>0);assert.equal(replay.data.replayed,true);
  assert.equal(replay.data.account.credits_charged,0);assert.equal(accounting.balance,4);
  assert.equal(embeddings(),before);
  worker.fetch=ordinary;
});

test('an evicted receipt never reruns an already settled search for free',async()=>{
  const {rpc,accounting,env,embeddings}=await setup({balance:5});
  await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  const storage=env.ACCESS_STATE.objects.get('user_alice1').state.storage;
  for(const [key] of await storage.list({prefix:'receipt:'}))await storage.delete(key);
  const before=embeddings();
  const replay=await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.match(replay.error,/^OPERATION_IN_PROGRESS/);
  assert.equal(accounting.balance,4);assert.equal(embeddings(),before);
});
