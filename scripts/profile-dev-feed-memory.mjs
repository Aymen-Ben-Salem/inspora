import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debuggingPort = 9333;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForJson(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed.");
  return result.result.value;
}

async function waitFor(client, expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function chromeWorkingSetBytes(rootPid) {
  const script = [
    `$browserRootPid = ${rootPid}`,
    "$browserProcessIds = @($browserRootPid)",
    "do {",
    "  $previousCount = $browserProcessIds.Count",
    "  $children = Get-CimInstance Win32_Process | Where-Object { $browserProcessIds -contains $_.ParentProcessId } | Select-Object -ExpandProperty ProcessId",
    "  $browserProcessIds = @($browserProcessIds + $children | Sort-Object -Unique)",
    "} while ($browserProcessIds.Count -gt $previousCount)",
    "$workingSets = foreach ($browserProcessId in $browserProcessIds) {",
    "  $browserProcess = Get-Process -Id $browserProcessId -ErrorAction SilentlyContinue",
    "  if ($browserProcess) { $browserProcess.WorkingSet64 }",
    "}",
    "($workingSets | Measure-Object -Sum).Sum",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-Command", script],
    { windowsHide: true },
  );
  return Number(stdout.trim());
}

async function inspectVideos(client) {
  return evaluate(
    client,
    `(() => {
      const videos = [...document.querySelectorAll("video")];
      const currentSources = videos.map((video) => video.currentSrc || "");
      const sourceAttributes = videos.map((video) => video.getAttribute("src") || "");
      const visibleVideos = videos.filter((video) => {
        const rect = video.getBoundingClientRect();
        return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      });
      return {
        documentTitle: document.title,
        pathname: location.pathname,
        videoElements: videos.length,
        visibleVideos: visibleVideos.length,
        visiblePlayingVideos: visibleVideos.filter((video) => !video.paused && video.readyState >= 2).length,
        sourceAttributes: sourceAttributes.filter(Boolean).length,
        networkEmptyVideos: videos.filter((video) => video.networkState === HTMLMediaElement.NETWORK_EMPTY).length,
        playingVideos: videos.filter((video) => !video.paused && video.readyState >= 2).length,
        previewSourceAttributes: sourceAttributes.filter((source) => source.includes("/posts/previews/")).length,
        currentPreviewSources: currentSources.filter((source) => source.includes("/posts/previews/")).length,
        nonPreviewSourceAttributes: sourceAttributes.filter((source) => source && !source.includes("/posts/previews/")).length,
        postLinks: document.querySelectorAll('a[href^="/posts/"]').length,
      };
    })()`,
  );
}

async function main() {
  const profileRoot = await mkdtemp(join(tmpdir(), "inspora-dev-chrome-profile-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${profileRoot}`,
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let client;
  try {
    const version = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    const pages = await waitForJson(`http://127.0.0.1:${debuggingPort}/json`);
    const page = pages.find((candidate) => candidate.type === "page");
    if (!page) throw new Error("Chrome did not expose a page target.");
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const baselineBytes = await chromeWorkingSetBytes(chrome.pid);
    await client.send("Page.navigate", { url: "http://localhost:3000" });
    await waitFor(client, 'document.readyState === "complete"');
    await waitFor(client, 'document.querySelectorAll("video").length > 0');
    await delay(8_000);
    const feed = await inspectVideos(client);
    const feedBytes = await chromeWorkingSetBytes(chrome.pid);

    await evaluate(
      client,
      `(async () => {
        const response = await fetch("/api/posts");
        const page = await response.json();
        const originalUrl = page.items[0].media[0].url;
        const visibleVideos = [...document.querySelectorAll("video")].filter((video) => {
          const rect = video.getBoundingClientRect();
          return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        });
        await Promise.allSettled(visibleVideos.map(async (video) => {
          video.src = originalUrl;
          video.load();
          await video.play();
        }));
      })()`,
    );
    await delay(8_000);
    const originalFeed = await inspectVideos(client);
    const originalFeedBytes = await chromeWorkingSetBytes(chrome.pid);

    await client.send("Page.navigate", { url: "http://localhost:3000" });
    await waitFor(client, 'document.readyState === "complete"');
    await waitFor(client, 'document.querySelectorAll("video").length > 0');
    await delay(8_000);
    const restoredFeedBytes = await chromeWorkingSetBytes(chrome.pid);

    const firstPostSlug = await evaluate(
      client,
      '(async () => { const response = await fetch("/api/posts"); const page = await response.json(); return page.items[0].slug; })()',
    );
    const targetPath = `/posts/${firstPostSlug}`;
    const targetSelector = `a[href="${targetPath}"]`;
    const linkCount = await evaluate(
      client,
      `document.querySelectorAll(${JSON.stringify(targetSelector)}).length`,
    );
    if (linkCount < 1) throw new Error("Could not find the first existing post link.");
    await evaluate(
      client,
      `document.querySelector(${JSON.stringify(targetSelector)}).click()`,
    );
    await waitFor(client, `location.pathname === ${JSON.stringify(targetPath)}`);
    await delay(5_000);
    const modal = await inspectVideos(client);
    const modalBytes = await chromeWorkingSetBytes(chrome.pid);

    console.log(
      JSON.stringify(
        {
          browser: version.Browser,
          baselineMiB: Math.round(baselineBytes / 1024 / 1024),
          feedMiB: Math.round(feedBytes / 1024 / 1024),
          feedIncreaseMiB: Math.round((feedBytes - baselineBytes) / 1024 / 1024),
          originalFeedMiB: Math.round(originalFeedBytes / 1024 / 1024),
          originalFeedIncreaseFromPreviewMiB: Math.round((originalFeedBytes - feedBytes) / 1024 / 1024),
          modalMiB: Math.round(modalBytes / 1024 / 1024),
          modalIncreaseFromFeedMiB: Math.round((modalBytes - restoredFeedBytes) / 1024 / 1024),
          feed,
          originalFeed,
          modal,
        },
        null,
        2,
      ),
    );
  } finally {
    client?.close();
    chrome.kill();
    await delay(500);
    const resolvedTempRoot = tmpdir().toLowerCase();
    const resolvedProfileRoot = profileRoot.toLowerCase();
    if (!resolvedProfileRoot.startsWith(`${resolvedTempRoot}\\`)) {
      throw new Error("Refusing to clean a browser profile outside the temp directory.");
    }
    await rm(profileRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Development feed memory profile failed.", error);
  process.exitCode = 1;
});
