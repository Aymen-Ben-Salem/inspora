// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackDataBullPage, dataBullPageUrl, isDataBullPublicPath, type DataBullConfig } from "./databull";
import { setAnalyticsDisabled } from "./privacy";

const config: DataBullConfig = {endpoint:"https://analytics.example/api/events",websiteId:"dc_fixture1234",domain:"inspora.design"};
const fetchMock=vi.fn().mockResolvedValue({ok:true});
let dispose: (()=>void)|undefined;
let serial=0;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();fetchMock.mockResolvedValue({ok:true});
  vi.stubGlobal("location",new URL(`https://www.inspora.design/posts/fixture-${++serial}`));
  vi.stubGlobal("navigator",{doNotTrack:"0",globalPrivacyControl:false});
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  vi.spyOn(document,"referrer","get").mockReturnValue("https://search.example/private?q=secret");
});
afterEach(()=>{
  dispose?.();dispose=undefined;
  document.cookie="inspora_analytics_disabled=; Path=/; Max-Age=0";
  vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
});
function start(){dispose=trackDataBullPage(config,window.location.pathname);vi.advanceTimersByTime(0);}
function bodies(){return fetchMock.mock.calls.map(([,o])=>JSON.parse(o.body));}

describe("DataBull engagement delivery",()=>{
  function hide(){vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");document.dispatchEvent(new Event("visibilitychange"));}
  function finish(){window.dispatchEvent(new Event("pagehide"));dispose?.();dispose=undefined;}
  function heartbeats(){return bodies().filter(body=>body.type==="heartbeat");}
  async function settle(){await vi.advanceTimersByTimeAsync(0);}

  it("coalesces identical exit updates and lets the final request finish",()=>{
    fetchMock.mockImplementation(()=>new Promise(()=>{}));
    start();vi.advanceTimersByTime(5_000);hide();finish();
    expect(heartbeats()).toHaveLength(1);
    expect(heartbeats()[0].engagement.time).toBe(5_000);
    expect(fetchMock.mock.calls.every(([,options])=>!options.signal.aborted)).toBe(true);
    setAnalyticsDisabled(true);
    expect(fetchMock.mock.calls.every(([,options])=>options.signal.aborted)).toBe(true);
  });

  it("does not resend an identical exit update that was delivered",async()=>{
    start();vi.advanceTimersByTime(5_000);hide();await settle();finish();
    expect(heartbeats()).toHaveLength(1);
  });

  it.each(["network","http"])("retries a coalesced final update once after %s failure",async failure=>{
    let reject!: (error:Error)=>void;
    let resolve!: (response:{ok:boolean})=>void;
    fetchMock.mockResolvedValue({ok:true});start();
    fetchMock.mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));
    vi.advanceTimersByTime(5_000);hide();finish();
    expect(heartbeats()).toHaveLength(1);
    if(failure==="network")reject(new Error("offline"));else resolve({ok:false});
    await settle();expect(heartbeats()).toHaveLength(2);
    expect(heartbeats()[1]).toEqual(heartbeats()[0]);
  });

  it("bounds the fallback and does not retry after privacy opt-out",async()=>{
    let reject!: (error:Error)=>void;
    fetchMock.mockResolvedValue({ok:true});start();
    fetchMock.mockImplementationOnce(()=>new Promise((_,no)=>{reject=no;}));
    vi.advanceTimersByTime(5_000);hide();finish();setAnalyticsDisabled(true);
    reject(new Error("aborted"));await settle();expect(heartbeats()).toHaveLength(1);
  });

  it("does not create an infinite retry loop when both final attempts fail",async()=>{
    fetchMock.mockResolvedValue({ok:true});start();
    fetchMock.mockRejectedValue(new Error("offline"));
    vi.advanceTimersByTime(5_000);hide();finish();await settle();
    expect(heartbeats()).toHaveLength(2);await settle();expect(heartbeats()).toHaveLength(2);
  });

  it("still sends a resumed session heartbeat even with unchanged engagement",async()=>{
    start();vi.advanceTimersByTime(5_000);hide();await settle();
    vi.advanceTimersByTime(10*60_000);
    vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");document.dispatchEvent(new Event("visibilitychange"));
    expect(heartbeats()).toHaveLength(2);
    expect(heartbeats()[1].engagement.time).toBe(5_000);
    vi.advanceTimersByTime(60_000);
    expect(heartbeats().at(-1).engagement.time).toBe(60_000);
    finish();expect(heartbeats().at(-1).engagement.time).toBe(65_000);
  });

  it("keeps the newer final engagement value on navigation",()=>{
    start();vi.advanceTimersByTime(60_000);vi.advanceTimersByTime(5_000);
    vi.stubGlobal("location",new URL("https://www.inspora.design/profile?secret=private"));finish();
    expect(heartbeats().map(body=>body.engagement.time)).toEqual([60_000,65_000]);
    expect(JSON.stringify(heartbeats())).not.toContain("secret");
  });
});

describe("DataBull privacy boundary",()=>{
  it.each(["/admin","/admin/users","/sign-in","/sign-up","/profile","/saved","/submit","/sponsor/start","/sponsor/campaigns/123","/creators/person/claim","/unexpected/token"])("never collects %s",pathname=>{
    vi.stubGlobal("location",new URL("https://www.inspora.design"+pathname));start();vi.advanceTimersByTime(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["https://preview.inspora.design/","https://inspora-example.vercel.app/","http://localhost:3000/"])("does not mix nonpublic hosts into traffic: %s",href=>{
    vi.stubGlobal("location",new URL(href));start();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{doNotTrack:"1"},{globalPrivacyControl:true}])("respects browser privacy signals %j",navigator=>{
    vi.stubGlobal("navigator",navigator);start();expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends only sanitized public-page data, omits cookies and IDs, and creates no storage",()=>{
    const cookies=document.cookie,local=localStorage.length,session=sessionStorage.length;
    vi.stubGlobal("location",new URL("https://www.inspora.design/posts/public?token=secret&utm_source=x&utm_campaign=launch#private"));
    start();expect(bodies()).toEqual([expect.objectContaining({type:"pageview",href:"https://www.inspora.design/posts/public?utm_source=x&utm_campaign=launch",referrer:"https://search.example",consent:false})]);
    const payload=bodies()[0];expect(payload).not.toHaveProperty("visitorId");expect(payload).not.toHaveProperty("sessionId");expect(payload).not.toHaveProperty("extraData");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({credentials:"omit",referrerPolicy:"no-referrer"});
    expect(document.cookie).toBe(cookies);expect(localStorage.length).toBe(local);expect(sessionStorage.length).toBe(session);
  });
  it("honors opt-out immediately, aborts pending sends and resumes only on opt-in",()=>{
    start();const signal=fetchMock.mock.calls[0][1].signal;
    setAnalyticsDisabled(true);expect(signal.aborted).toBe(true);vi.advanceTimersByTime(120_000);expect(fetchMock).toHaveBeenCalledTimes(1);
    setAnalyticsDisabled(false);expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("can start after an initially disabled preference is enabled",()=>{
    setAnalyticsDisabled(true);start();expect(fetchMock).not.toHaveBeenCalled();
    setAnalyticsDisabled(false);expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("gates navigation before React cleans up and tracks the next public page",()=>{
    start();vi.stubGlobal("location",new URL("https://www.inspora.design/profile?token=private"));vi.advanceTimersByTime(60_000);expect(fetchMock).toHaveBeenCalledTimes(1);
    dispose?.();vi.stubGlobal("location",new URL("https://www.inspora.design/logos"));start();expect(bodies().at(-1).href).toBe("https://www.inspora.design/logos");
  });
  it("stops on disposal and does not send a discarded React effect",()=>{
    dispose=trackDataBullPage(config,window.location.pathname);dispose?.();vi.advanceTimersByTime(120_000);expect(fetchMock).not.toHaveBeenCalled();
  });
  it("finishes short public-page engagement without sending the private destination",()=>{
    start();const publicHref=bodies()[0].href;vi.advanceTimersByTime(5_000);
    vi.stubGlobal("location",new URL("https://www.inspora.design/profile?token=private"));
    dispose?.();dispose=undefined;
    expect(bodies().at(-1)).toMatchObject({type:"heartbeat",href:publicHref,engagement:{href:publicHref,time:5_000}});
    expect(JSON.stringify(bodies())).not.toContain("token=private");
    const count=fetchMock.mock.calls.length;vi.advanceTimersByTime(60_000);expect(fetchMock).toHaveBeenCalledTimes(count);
  });
  it("updates foreground time, pauses in the background, and caps idle collection",()=>{
    start();vi.advanceTimersByTime(60_000);expect(bodies()[1]).toMatchObject({type:"heartbeat",engagement:{time:60_000}});
    vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");document.dispatchEvent(new Event("visibilitychange"));
    const count=fetchMock.mock.calls.length;vi.advanceTimersByTime(60_000);expect(fetchMock).toHaveBeenCalledTimes(count);
    vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");document.dispatchEvent(new Event("visibilitychange"));expect(bodies().at(-1).engagement.time).toBe(60_000);
    vi.advanceTimersByTime(30*60_000);const idle=fetchMock.mock.calls.length;vi.advanceTimersByTime(60_000);expect(fetchMock).toHaveBeenCalledTimes(idle);
  });
  it("does not treat consent or click attributes as permission for extra tracking",()=>{
    start();document.dispatchEvent(new Event("click"));expect(bodies().map(b=>b.type)).toEqual(["pageview"]);
  });
});

it("keeps only safe campaign labels and public routes",()=>{
  expect(dataBullPageUrl("https://inspora.design/?utm_source=x&utm_medium=social&utm_campaign=a%40b.com&email=private#token")).toBe("https://inspora.design/?utm_source=x&utm_medium=social");
  expect(isDataBullPublicPath("/sponsor")).toBe(true);expect(isDataBullPublicPath("/creators/person")).toBe(true);
});
