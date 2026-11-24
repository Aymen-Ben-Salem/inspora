import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../http.mjs';
import {buildCatalog,publishCatalog} from '../catalog.mjs';
import {TOOL_LIMITS,SEARCH_LIMITS,ACCESS_CACHE_MS} from '../access-state.mjs';
import {accountView} from '../pro-accounting.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';
import {sha} from '../../catalog.mjs';
import {Bucket,Namespace} from './helpers.mjs';

const origin='https://mcp.test',token='pro_token_'.padEnd(43,'a'),accountingToken='acct_'.padEnd(43,'z');

test('management links support loopback fixtures while rejecting unsafe origins and embedded credentials',()=>{
  assert.equal(accountView({access:'pro',manage_url:'http://localhost:3391/account/pro'}).manage_url,'http://localhost:3391/account/pro');
  for(const value of ['http://evil.test/account/pro','https://user:secret@site.test/account/pro','https://site.test/account/pro?token=private','javascript:alert(1)'])assert.equal(accountView({access:'pro',manage_url:value}).manage_url,'https://www.inspora.design/account/pro');
});

// In-memory stand-in for the website's private Pro access contract (test fixture only).
function fakeAccounting({access='pro',reason}={}){
  const site={access,reason,calls:[],down:false,answer:null};
  site.fetch=async(url,init)=>{
    assert.equal(url,'https://site.test/api/internal/pro/mcp-usage');
    assert.equal(init.headers.Authorization,'Bearer '+accountingToken);
    if(site.down)throw Error('network');
    const body=JSON.parse(init.body);site.calls.push(body.action);
    assert.deepEqual(Object.keys(body).sort(),['action','userId']);
    const manage='https://site.test/account/pro';
    if(site.answer)return Response.json(site.answer);
    if(site.access==='trial')return Response.json({access:'trial'});
    if(site.access==='denied')return Response.json({access:'denied',reason:site.reason,manage_url:manage});
    return Response.json({access:'pro',manage_url:manage});
  };
  return site;
}

async function setup(accountingOptions){
  const rows=Array.from({length:12},(_,i)=>({...work(i+1,'design'),title:'Blue glass '+(i+1),description:'Blue glass panels with a geometric grid',colors:['Blue']}));
  const index=await buildCatalog({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(row=>note(row))}},{embed}),bucket=new Bucket();
  await publishCatalog(bucket,index);
  let embeddings=0;
  const accounting=fakeAccounting(accountingOptions);
  const env={MCP_ORIGIN:origin,ACCESS_MODE:'pilot',MCP_ACCESS_POLICY:'pro',PRO_ACCOUNTING_URL:'https://site.test/api/internal/pro/mcp-usage',PRO_ACCOUNTING_TOKEN:accountingToken,MCP_PILOT_TOKENS:JSON.stringify([{id:'user_alice1',sha256:sha(token),expiresAt:'2099-01-01'}]),CATALOG:bucket,ACCESS_STATE:new Namespace(),AI:{run:async(_model,args)=>{embeddings++;return {data:await embed(args.text)};}}};
  const worker=createWorker({accountingFetch:accounting.fetch});
  const rpc=async(id,name,args={})=>{
    const response=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})}),env);
    const body=await response.json();
    const result=body.result;
    return {status:response.status,error:result?.isError?JSON.parse(result.content[0].text).error:null,data:result&&!result.isError?JSON.parse(result.content[0].text):null};
  };
  const storage=()=>env.ACCESS_STATE.objects.get('user_alice1').state.storage;
  // Simulates the short access cache expiring.
  const expireAccess=async()=>storage().delete('pro_access');
  return {env,worker,rpc,accounting,embeddings:()=>embeddings,storage,expireAccess,ids:rows.map(row=>row.id)};
}

test('customer policy fails closed without a configured accounting boundary',async()=>{
  const {env,worker}=await setup();
  delete env.PRO_ACCOUNTING_URL;
  const response=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'}),env);
  assert.equal(response.status,503);
  env.PRO_ACCOUNTING_URL='http://site.test/api/internal/pro/mcp-usage';
  assert.equal((await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'}),env)).status,503);
});

test('an active Pro account searches with no credits and no account block in results',async()=>{
  const {rpc,accounting}=await setup();
  const first=await rpc(1,'search_inspiration',{query:'blue glass grid',count:3});
  assert.ok(first.data.results.length>0);
  assert.equal(first.data.account,undefined);
  assert.ok(!/credit/i.test(JSON.stringify(first.data).replace(/"creator[^"]*"/g,'')));
  await rpc(2,'search_inspiration',{query:'blue glass grid',count:3});
  // An active answer is reused briefly instead of asking the website on every call.
  assert.deepEqual(accounting.calls,['access']);
});

test('every tool needs current Pro: there is no free tier, including details',async()=>{
  const {rpc,accounting,embeddings,expireAccess,ids}=await setup({access:'denied',reason:'no_active_subscription'});
  const search=await rpc(1,'search_inspiration',{query:'blue glass'});
  assert.match(search.error,/^PRO_REQUIRED: .*included with an active Inspora Pro subscription.*https:\/\/site\.test\/account\/pro/);
  assert.equal(embeddings(),0);
  assert.match((await rpc(2,'get_work',{id:ids[0]})).error,/^PRO_REQUIRED/);
  assert.match((await rpc(3,'get_works',{ids:[ids[0]]})).error,/^PRO_REQUIRED/);
  // A denied answer is never cached: subscribing works on the next call.
  assert.deepEqual(accounting.calls,['access','access','access']);
  accounting.access='pro';await expireAccess();
  assert.ok((await rpc(4,'search_inspiration',{query:'blue glass grid'})).data.results.length>0);
});

test('a cancellation or payment review applies once the short access cache expires',async()=>{
  const {rpc,accounting,expireAccess}=await setup();
  assert.ok(ACCESS_CACHE_MS<=60000);
  await rpc(1,'search_inspiration',{query:'blue glass grid'});
  accounting.access='denied';accounting.reason='payment_review';
  await expireAccess();
  assert.match((await rpc(2,'search_inspiration',{query:'blue glass grid'})).error,/^PAYMENT_REVIEW: /);
});

test('inactive accounts get minimal guidance; status stays available and shows usage',async()=>{
  const {rpc}=await setup({access:'denied',reason:'payment_review'});
  assert.match((await rpc(1,'search_inspiration',{query:'blue glass'})).error,/^PAYMENT_REVIEW: /);
  const status=await rpc(2,'catalog_status');
  assert.equal(status.data.account.access,'inactive');assert.equal(status.data.account.reason,'payment_review');
  assert.equal(status.data.account.manage_url,'https://site.test/account/pro');
  assert.equal(status.data.account.searches_this_month,0);
  assert.equal(status.data.account.monthly_search_limit,SEARCH_LIMITS.month);
  assert.equal(status.data.limits.searches_per_month,SEARCH_LIMITS.month);
  assert.ok(!JSON.stringify(status.data).includes(accountingToken));
  assert.ok(!/credit/i.test(JSON.stringify(status.data.account)));
});

test('fresh searches count toward the monthly fair-use limit; continuation and details do not',async()=>{
  const {rpc,storage,embeddings}=await setup();
  const first=await rpc(1,'search_inspiration',{query:'blue glass grid',count:2});
  assert.ok(first.data.next_cursor);
  await rpc(2,'search_inspiration',{cursor:first.data.next_cursor,count:2});
  await rpc(3,'get_works',{ids:first.data.results.map(work=>work.id)});
  let status=await rpc(4,'catalog_status');
  assert.equal(status.data.account.searches_this_month,1);
  // At the limit, a new search is refused before any search work; continuation still works.
  const month=new Date().toISOString().slice(0,7);
  await storage().put('searches',{month,count:SEARCH_LIMITS.month});
  const before=embeddings();
  const refused=await rpc(5,'search_inspiration',{query:'another blue grid'});
  assert.match(refused.error,new RegExp(`^SEARCH_LIMIT_REACHED: .*${SEARCH_LIMITS.month} new searches a month.*resets at \\d{4}-\\d{2}-01T00:00:00\\.000Z`));
  assert.equal(embeddings(),before);
  assert.ok((await rpc(6,'search_inspiration',{cursor:first.data.next_cursor,count:2})).data.results.length>0);
  status=await rpc(7,'catalog_status');
  assert.equal(status.data.account.searches_this_month,SEARCH_LIMITS.month);
  // A new month starts from zero.
  await storage().put('searches',{month:'2000-01',count:SEARCH_LIMITS.month});
  assert.ok((await rpc(8,'search_inspiration',{query:'blue glass grid'})).data.results.length>0);
});

test('the team trial passes through the same boundary without an account block',async()=>{
  const {rpc,accounting}=await setup({access:'trial'});
  const result=await rpc(1,'search_inspiration',{query:'blue glass grid',count:2});
  assert.ok(result.data.results.length>0);assert.equal(result.data.account,undefined);
  assert.deepEqual(accounting.calls,['access']);
});

test('tool-call limits refuse with retry timing before access checks or search',async()=>{
  const {rpc,accounting}=await setup();
  for(let i=0;i<TOOL_LIMITS.minute;i++)assert.equal((await rpc(i+1,'catalog_status')).error,null);
  const calls=accounting.calls.length;
  const refused=await rpc(99,'search_inspiration',{query:'blue glass'});
  assert.match(refused.error,/^TOOL_LIMIT_REACHED: retry after \d+ seconds/);
  assert.ok(!/credit/i.test(refused.error));
  assert.equal(accounting.calls.length,calls);
});

test('website outages fail closed without running a search',async()=>{
  const {rpc,accounting,embeddings}=await setup();
  accounting.down=true;
  const refused=await rpc(1,'search_inspiration',{query:'blue glass'});
  assert.match(refused.error,/^ACCOUNTING_UNAVAILABLE/);assert.equal(embeddings(),0);
});

test('an unexpected website answer is treated as no access, with the default management link',async()=>{
  const {rpc,accounting,embeddings}=await setup();
  accounting.answer={access:'maybe',manage_url:'javascript:alert(1)'};
  const refused=await rpc(1,'search_inspiration',{query:'blue glass'});
  assert.match(refused.error,/^PRO_REQUIRED: .*https:\/\/www\.inspora\.design\/account\/pro/);
  assert.equal(embeddings(),0);
});
