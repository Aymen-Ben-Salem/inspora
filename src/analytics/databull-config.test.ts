import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import {getDataBullConfig} from "./databull-config";
const env={DATABULL_ENABLED:"true",VERCEL_ENV:"production",DATABULL_URL:"https://analytics.example",DATABULL_WEBSITE_ID:"dc_fixture1234",SITE_URL:"https://www.inspora.design"};
it("enables only explicitly configured production collection",()=>{
  expect(getDataBullConfig(env)).toEqual({endpoint:"https://analytics.example/api/events",websiteId:"dc_fixture1234",domain:"inspora.design"});
  for(const VERCEL_ENV of [undefined,"preview","development"])expect(getDataBullConfig({...env,VERCEL_ENV})).toBeNull();
  for(const DATABULL_ENABLED of [undefined,"false"])expect(getDataBullConfig({...env,DATABULL_ENABLED})).toBeNull();
});
it("rejects malformed or credential-bearing configuration",()=>{
  for(const DATABULL_URL of [undefined,"http://analytics.example","https://secret@analytics.example","https://analytics.example?key=secret"])
    expect(getDataBullConfig({...env,DATABULL_URL})).toBeNull();
  expect(getDataBullConfig({...env,DATABULL_WEBSITE_ID:"license_secret"})).toBeNull();
});
