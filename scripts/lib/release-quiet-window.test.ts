import { describe,expect,it,vi } from 'vitest';
import { withReleaseQuietWindow } from './release-quiet-window';
describe('bounded preview/test backup window',()=>{
 const setup=()=>({environment:'test' as const,deadlineMs:60000,now:()=>0,pauseAndDrain:vi.fn(async()=>{}),capture:vi.fn(async()=>'capture'),checkUnchanged:vi.fn(async()=>{}),resumeAndVerify:vi.fn(async()=>{})});
 it('drains writers and brackets capture with unchanged checks, then resumes',async()=>{const io=setup();expect(await withReleaseQuietWindow(io)).toBe('capture');expect(io.checkUnchanged).toHaveBeenCalledTimes(2);expect(io.resumeAndVerify).toHaveBeenCalledOnce();});
 it('resumes on partial pause, drift, capture failure and expiry without accepting a capture',async()=>{
  for(const change of [{pauseAndDrain:async()=>{throw Error('partial pause')}},{checkUnchanged:async()=>{throw Error('drift')}},{capture:async()=>{throw Error('media drift')}}]){const io={...setup(),...change};await expect(withReleaseQuietWindow(io)).rejects.toThrow();expect(io.resumeAndVerify).toHaveBeenCalledOnce();}
  let now=0;const io={...setup(),now:()=>now,capture:vi.fn(async()=>{now=60000;return 'late'})};await expect(withReleaseQuietWindow(io)).rejects.toThrow(/expired/);expect(io.resumeAndVerify).toHaveBeenCalledOnce();
 });
 it('rejects production and excessive bounds before pausing',async()=>{for(const change of [{environment:'production' as 'test'},{deadlineMs:3600000}]){const io={...setup(),...change};await expect(withReleaseQuietWindow(io)).rejects.toThrow(/scope|bound/);expect(io.pauseAndDrain).not.toHaveBeenCalled();}});
 it('aborts a stalled capture at the real deadline and resumes writers',async()=>{vi.useFakeTimers();try{let signal:AbortSignal|undefined;const io={...setup(),deadlineMs:1000,capture:vi.fn((s:AbortSignal)=>{signal=s;return new Promise<string>(()=>{});})};const work=withReleaseQuietWindow(io);const rejected=expect(work).rejects.toThrow(/expired/);await vi.advanceTimersByTimeAsync(1000);await rejected;expect(signal?.aborted).toBe(true);expect(io.resumeAndVerify).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}});
});
