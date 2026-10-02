import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { releaseDatabaseFromValues, pendingReleaseMigrations } from "./release-migration";

const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const target={label:"rehearsal" as const,endpointSha256:hash("ep-rehearsal.example.neon.tech"),roleSha256:hash("owner"),sourceDatabase:"neondb",destinationDatabase:"phase3_production_restore"};
const values={DATABASE_URL:"postgresql://owner:secret@ep-rehearsal-pooler.example.neon.tech/neondb?sslmode=require",DATABASE_URL_UNPOOLED:"postgresql://owner:secret@ep-rehearsal.example.neon.tech/neondb?sslmode=require"};
describe("release migration guards",()=>{
 it("uses only explicit values and a fixed isolated database",()=>{
   const url=releaseDatabaseFromValues(values,target,{});
   expect(new URL(url).pathname).toBe("/phase3_production_restore");
   expect(new URL(url).hostname).toBe("ep-rehearsal.example.neon.tech");
 });
 it.each([
   {...values,DATABASE_URL:values.DATABASE_URL.replace("ep-rehearsal-","ep-production-")},
   {...values,DATABASE_URL_UNPOOLED:values.DATABASE_URL},
   {...values,DATABASE_URL_UNPOOLED:values.DATABASE_URL_UNPOOLED.replace("/neondb","/other")},
   {...values,DATABASE_URL_UNPOOLED:values.DATABASE_URL_UNPOOLED.replace("owner:","other:")},
   {...values,DATABASE_URL_UNPOOLED:values.DATABASE_URL_UNPOOLED+"&options=-csearch_path=other"},
   {...values,DATABASE_URL:""},
 ])("rejects wrong/missing endpoint, database, role and connection options before a client exists",v=>{
   expect(()=>releaseDatabaseFromValues(v,target,{})).toThrow(/Release/);
 });
 it("rejects inherited mismatches without filling missing file values from the shell",()=>{
   expect(()=>releaseDatabaseFromValues(values,target,{DATABASE_URL:"postgres://wrong"})).toThrow(/inherited/);
   expect(()=>releaseDatabaseFromValues({...values,DATABASE_URL:""},target,values)).toThrow();
 });
 it("requires truthful production identity",()=>{
   expect(()=>releaseDatabaseFromValues(values,{...target,label:"production",destinationDatabase:"neondb"},{})).toThrow(/DATA_ENVIRONMENT/);
 });
 const migrations=[{tag:"0000_first",when:1,hash:"a",lfHash:"aa"},{tag:"0001_second",when:2,hash:"b",lfHash:"bb"}];
 it("accepts the exact ledger prefix including audited LF normalization and yields zero pending on rerun",()=>{
   expect(pendingReleaseMigrations(migrations,[{id:1,hash:"aa",created_at:"1"}])).toEqual([migrations[1]]);
   expect(pendingReleaseMigrations(migrations,[{id:1,hash:"aa",created_at:1},{id:2,hash:"b",created_at:2}])).toEqual([]);
 });
 it("accepts sequence gaps left by a rolled-back migration without accepting reordered ledger IDs",()=>{
   expect(pendingReleaseMigrations(migrations,[{id:1,hash:"a",created_at:1},{id:9,hash:"b",created_at:2}])).toEqual([]);
   expect(()=>pendingReleaseMigrations(migrations,[{id:9,hash:"a",created_at:1},{id:1,hash:"b",created_at:2}])).toThrow(/ledger/);
 });
 it.each([
   [{id:1,hash:"changed",created_at:1}],
   [{id:1,hash:"b",created_at:2}],
   [{id:1,hash:"a",created_at:1},{id:1,hash:"a",created_at:1}],
   [],
  ].map(ledger=>({ledger})))("rejects changed, skipped, duplicated or empty release history",({ledger})=>{
   expect(()=>pendingReleaseMigrations(migrations,ledger)).toThrow(/ledger/);
 });
});
