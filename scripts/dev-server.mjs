import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { ensureDevRoutes } from "./dev-route-check.mjs";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const portIndex = args.findIndex(arg => arg === "--port" || arg === "-p");
const port = Number(portIndex >= 0 ? args[portIndex + 1] :
  args.find(arg => arg.startsWith("--port="))?.slice(7) ?? process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("A valid development port is required.");
// Pin the selected port so a busy server cannot silently create another one.
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...args,
  ...(portIndex >= 0 || args.some(arg => arg.startsWith("--port=")) ? [] : ["--port", String(port)])],
{ stdio: ["inherit", "pipe", "pipe"], windowsHide: true });
let checked = false;
const checks = new AbortController();
child.stdout.on("data", chunk => {
  process.stdout.write(chunk);
  if (!checked && /Ready in/.test(String(chunk))) {
    checked = true;
    void ensureDevRoutes({ port, signal: checks.signal }).then(result => {
      if (checks.signal.aborted) return;
      if (result.recovered) console.log("Development API route discovery restored.");
      else if (!result.ready) console.warn("Development API routes did not become ready. Check the server output before retrying.");
    });
  }
});
child.stderr.on("data", chunk => process.stderr.write(chunk));
child.on("error", error => { checks.abort(); console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { checks.abort(); process.exitCode = code ?? 1; });
function stop(signal) {
  checks.abort();
  if (process.platform !== "win32") { child.kill(signal); return; }
  const terminateTree = () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    // Windows kill(signal) terminates only the CLI. Its forked server must also
    // stop; constrain cleanup to the process tree this launcher started.
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "inherit", windowsHide: true });
  };
  if (signal === "SIGINT") {
    // Console Ctrl+C also reaches Next. Let its normal cleanup finish first.
    setTimeout(terminateTree, 1500).unref();
  } else terminateTree();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
