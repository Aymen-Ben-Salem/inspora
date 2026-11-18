// Container-enabled Durable Object that runs the visual-pack builder (visual-pack/Dockerfile).
// It starts the container on demand, forwards one job, and stops it after a short idle
// period so it is billed only while working. The container receives only a public row.
export const PACKER_PORT = 8080;
export const SLEEP_AFTER_MS = 60 * 1000;
const READY_TIMEOUT_MS = 60_000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class VisualPacker {
  constructor(ctx, env) {this.ctx = ctx; this.env = env;}

  async ready(container) {
    if (!container.running) {
      container.start({enableInternet:true});
      this.ctx.waitUntil(container.monitor().catch(() => {}));
    }
    const port = container.getTcpPort(PACKER_PORT), deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      try {
        const response = await port.fetch('http://container/health');
        if (response.ok) return port;
      } catch { /* Still starting. */ }
      if (Date.now() > deadline) throw Error('VISUAL_PACKER_NOT_READY');
      await pause(500);
    }
  }

  async fetch(request) {
    const container = this.ctx.container;
    if (!container) return Response.json({error:'CONTAINER_UNAVAILABLE'}, {status:503});
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/pack') return Response.json({error:'NOT_FOUND'}, {status:404});
    await this.ctx.storage.deleteAlarm();
    try {
      const port = await this.ready(container);
      return await port.fetch('http://container/pack', {method:'POST', headers:{'content-type':'application/json'}, body:await request.text()});
    } catch {
      return Response.json({error:'VISUAL_PACKER_UNAVAILABLE'}, {status:503});
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + SLEEP_AFTER_MS);
    }
  }

  async alarm() {
    if (this.ctx.container?.running) await this.ctx.container.destroy();
  }
}
