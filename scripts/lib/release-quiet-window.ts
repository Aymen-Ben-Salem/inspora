/** A quiet window is an operator-controlled test/preview procedure, never a production switch. */
export async function withReleaseQuietWindow<T>(io: {
  environment: 'preview' | 'test'; deadlineMs: number; now(): number;
  pauseAndDrain(signal: AbortSignal): Promise<void>; capture(signal: AbortSignal): Promise<T>; checkUnchanged(signal: AbortSignal): Promise<void>;
  resumeAndVerify(): Promise<void>;
}) {
  if (!['preview','test'].includes(io.environment) || !Number.isSafeInteger(io.deadlineMs) || io.deadlineMs < 1000 || io.deadlineMs > 15 * 60 * 1000) throw Error('Backup quiet window scope or bound rejected');
  const deadline = io.now() + io.deadlineMs;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Backup quiet window expired; capture rejected'));},io.deadlineMs);});
  const run = <R>(work: Promise<R>) => Promise.race([work,expired]);
  const bounded = () => { if (io.now() >= deadline) throw Error('Backup quiet window expired; capture rejected'); };
  // Also resume after a partially successful pause/drain. Failed captures are never accepted.
  try {
    await run(io.pauseAndDrain(abort.signal)); bounded(); await run(io.checkUnchanged(abort.signal)); bounded();
    const result = await run(io.capture(abort.signal)); bounded(); await run(io.checkUnchanged(abort.signal)); bounded();
    return result;
  } finally { clearTimeout(timer!); abort.abort(); await io.resumeAndVerify(); }
}
