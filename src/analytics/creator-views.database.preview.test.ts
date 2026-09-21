import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { previewEnvironmentFromValues } from "../../scripts/lib/preview-environment";
import { requireDatabase, type Database } from "../db/client";
import { creators, posts, logos, websites, websiteMedia, websiteSections, creatorViewSnapshots } from "../db/schema";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({cacheLife:vi.fn(),cacheTag:vi.fn()}));
const provider = vi.hoisted(() => ({query:vi.fn()}));
vi.mock("./posthog-query", () => ({
  getPostHogConfiguration: () => ({apiHost:"https://eu.posthog.com",projectId:"280536",personalApiKey:"fixture-only"}),
  runHogQlQuery: provider.query,
}));
const suite = process.env.RUN_PREVIEW_VIEWS_DATABASE === "1" ? describe : describe.skip;
suite("Preview eligibility and durable Views snapshots", () => {
  const owner = randomUUID(), other = randomUUID();
  const design = randomUUID(), draft = randomUUID(), logo = randomUUID(), icon = randomUUID(), website = randomUUID();
  const suffix = randomUUID();
  const snapshotKeys: string[] = [];
  let db: Database | undefined;
  beforeAll(async () => {
    const values = parse(readFileSync(".env.preview.local","utf8"));
    previewEnvironmentFromValues(values);
    for (const key of ["DATA_ENVIRONMENT","DATABASE_URL","DATABASE_URL_UNPOOLED","R2_BUCKET_NAME","R2_PUBLIC_BASE_URL","R2_SUBMISSIONS_BUCKET_NAME","NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"]) vi.stubEnv(key,values[key]);
    const cutover = new Date(Date.now()-60000).toISOString();
    vi.stubEnv("POSTHOG_WORK_VIEWS_CUTOVER_AT",cutover);
    const hash = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const scope = hash(["preview",values.DATABASE_URL,"https://eu.posthog.com","280536",values.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,cutover]);
    snapshotKeys.push(hash([scope,owner]),hash([scope,other]));
    db = requireDatabase();
    await db.insert(creators).values([owner,other].map(id => ({id,name:"Task 8 automated fixture",avatarUrl:"/brand/default-avatar.svg",recordOrigin:"preview"})));
    await db.insert(posts).values([design,draft].map(id=>({id,creatorId:owner,slug:"task8-"+id,title:"Task 8 fixture",description:"Isolated automated fixture",category:"Web",sourceUrl:"https://example.com",status:id===draft?"draft":"published",publishedAt:new Date(0)})));
    await db.insert(logos).values([logo,icon].map(id=>({id,creatorId:owner,slug:"task8-"+id,title:"Task 8 fixture",description:"Isolated fixture",kind:id===icon?"icon":"logo",industry:"Technology",shape:"Abstract",sourceUrl:"https://example.com",status:"published",publishedAt:new Date(0)})));
    await db.insert(websites).values({id:website,creatorId:owner,slug:"task8-"+suffix,title:"Task 8 fixture",tagline:"Isolated fixture",description:"Isolated fixture",sourceUrl:"https://example.com",status:"published",publishedAt:new Date(0)});
  },30000);
  afterAll(async () => {
    if (db) {
      await db.delete(creatorViewSnapshots).where(inArray(creatorViewSnapshots.key,snapshotKeys));
      await db.delete(posts).where(inArray(posts.id,[design,draft]));
      await db.delete(logos).where(inArray(logos.id,[logo,icon]));
      await db.delete(websites).where(eq(websites.id,website));
      await db.delete(creators).where(inArray(creators.id,[owner,other]));
    }
    vi.unstubAllEnvs();
  },30000);
  it("uses actual status, ownership and Website completeness across all content families", async () => {
    const {getEligibleCreatorWorkIds} = await import("./creator-views");
    expect(await getEligibleCreatorWorkIds(owner)).toEqual({design:[design],logo:[logo,icon].sort(),website:[]});
    await db!.insert(websiteMedia).values([
      {websiteId:website,role:"recording",url:"https://example.com/fixture.webm",posterUrl:"https://example.com/poster.png",width:100,height:100,videoPreview:{url:"https://example.com/preview.webm",width:100,height:100} as never},
      {websiteId:website,role:"favicon",url:"https://example.com/favicon.png",width:32,height:32},
    ]);
    await db!.insert(websiteSections).values({websiteId:website,label:"Fixture",position:0,imageUrl:"https://example.com/section.png",imageWidth:100,imageHeight:100});
    expect((await getEligibleCreatorWorkIds(owner)).website).toEqual([website]);
  });
  it("retains the successful timestamp across a fresh module/database client and rejects changed credit", async () => {
    const {getCreatorViews} = await import("./creator-views");
    provider.query.mockResolvedValue([[8]]);
    const success = await getCreatorViews(owner);
    expect(success).toMatchObject({status:"available",count:8});
    expect(await db!.select().from(creatorViewSnapshots).where(eq(creatorViewSnapshots.key,snapshotKeys[0]))).toHaveLength(1);
    vi.resetModules();
    provider.query.mockRejectedValue(new Error("fixture-only provider outage"));
    const freshWorker = await import("./creator-views");
    expect(await freshWorker.getCreatorViews(owner)).toEqual(success);
    await db!.update(posts).set({creatorId:other}).where(eq(posts.id,design));
    expect(await freshWorker.getCreatorViews(owner)).toEqual({status:"unavailable"});
    expect(await freshWorker.getCreatorViews(other)).toEqual({status:"unavailable"});
    await db!.update(logos).set({status:"archived",archivedAt:new Date()}).where(eq(logos.id,logo));
    expect((await freshWorker.getEligibleCreatorWorkIds(owner)).logo).toEqual([icon]);
    provider.query.mockResolvedValue([[3]]);
    expect(await freshWorker.getCreatorViews(owner)).toMatchObject({status:"available",count:3});
    provider.query.mockResolvedValue([[5]]);
    expect(await freshWorker.getCreatorViews(other)).toMatchObject({status:"available",count:5});
  },30000);
});
