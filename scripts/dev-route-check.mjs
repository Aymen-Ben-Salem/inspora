import { stat, utimes } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

// Next's development route discovery can retain an incomplete tree at boot.
// Probe automatic OPTIONS handlers: they need no session and run no app query.
const routes = ["/api/sponsorship/placements", "/api/sponsorship/analytics"];
export async function ensureDevRoutes({
  port,
  request = fetch,
  wait = (ms, signal) => pause(ms, undefined, { signal }),
  signal,
  touch = async () => {
    const path = resolve("src/app/api/sponsorship/placements/route.ts");
    const info = await stat(path);
    await utimes(path, info.atime, new Date());
  },
}) {
  let touched = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (signal?.aborted) break;
      await wait(attempt ? 1500 : 3000, signal);
      if (signal?.aborted) break;
      const responses = await Promise.all(routes.map(route => request(
        `http://localhost:${port}${route}`, { method: "OPTIONS", signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) },
      )));
      if (responses.every(response => response.status === 204)) return { ready: true, recovered: touched };
      if (!touched && responses.some(response => response.status === 404)) {
        await touch();
        touched = true;
      }
    } catch {
      // A just-started or stopped server may not accept connections yet.
      if (signal?.aborted) break;
    }
  }
  return { ready: false, recovered: false };
}
