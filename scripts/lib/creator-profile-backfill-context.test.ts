import {expect,it} from 'vitest';
import {initializeCreatorProfiles} from './creator-profile-backfill-database';

it('rejects an unbounded release backfill before any query',async()=>{
  let queries=0;
  const client={query:async()=>{queries++;throw Error('Unexpected query');}};
  await expect(initializeCreatorProfiles(client as never,true,undefined,{environment:'production',actorId:'release-test'})).rejects.toThrow(/bounded/);
  expect(queries).toBe(0);
});

it('records the supplied release actor and environment rather than preview audit metadata',async()=>{
  const calls:{sql:string;values?:unknown[]}[]=[];let reads=0;
  const client={query:async(sql:string,values?:unknown[])=>{
    calls.push({sql,values});
    if(sql.includes('select id, name'))return {rows:[{id:'a',name:'Ada',handle:null,username:reads++?'ada':null,ownerUserId:null,xProviderId:null,recordOrigin:'mirrored'}],rowCount:1};
    if(sql.includes('select creator_id'))return {rows:reads>1?[{creatorId:'a',username:'ada',isCurrent:true}]:[],rowCount:0};
    return {rows:[],rowCount:1};
  }};
  await initializeCreatorProfiles(client as never,true,new Set(['a']),{environment:'rehearsal',actorId:'phase3-release-backfill'});
  const audit=calls.find(c=>c.sql.includes('insert into admin_audit_logs'))!;
  expect(audit.values).toContain('phase3-release-backfill');
  expect(audit.values).toContain('rehearsal');
  expect(audit.sql).not.toContain("'preview'");
});
