import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import sharp from "sharp";
import { WebsiteFeedIcon } from "../src/components/websites/website-feed-icon";

const run = promisify(execFile);

async function main() {
  const requestedCase = process.argv.find(argument => argument.startsWith("--case="))?.slice(7);
  const indices = requestedCase === undefined ? Array.from({ length: 48 }, (_, index) => index) : [Number(requestedCase)];
  assert(indices.every(index => Number.isInteger(index) && index >= 0 && index < 48), "Use a case number from 0 to 47.");
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((path): path is string => Boolean(path));
  let chrome: string | undefined;
  for (const candidate of candidates) {
    try { await access(candidate); chrome = candidate; break; } catch { /* Try the next installed browser. */ }
  }
  assert(chrome, "Install Chrome/Chromium or set CHROME_PATH to run the icon border pixel regression check.");

  const directory = await mkdtemp(join(tmpdir(), "inspora-icon-border-"));
  let screenshot: string | undefined;
  try {
    const blank = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="39" height="39"><rect width="39" height="39" fill="white"/></svg>');
    const solid = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="39" height="39"><rect width="39" height="39" fill="black"/></svg>');
    const icons = (src: string) => indices.map(index => {
      const fraction = (index % 8) / 8;
      const zoom = [0.8, 0.9, 1, 1.1, 1.25, 1.5][Math.floor(index / 8)];
      return createElement("div", {
        key: index,
        "data-case": index,
        "data-zoom": zoom,
        style: { position: "absolute", left: 20 + (index % 8) * 100 + fraction, top: 25 + Math.floor(index / 8) * 100 + fraction, zoom },
      }, createElement(WebsiteFeedIcon, { src }));
    });
    const cssPath = resolve("src/app/globals.css");
    const source = (await readFile(cssPath, "utf8")).replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../components";');
    const { css } = await postcss([tailwind()]).process(source, { from: cssPath });
    const markup = renderToStaticMarkup(createElement("div", null,
      ...["white", "black", "baseline"].map((kind, index) => createElement("div", {
        key: kind, "data-pixel-group": kind, style: { position: "absolute", left: index * 1280, top: 0 },
      }, icons(kind === "white" ? blank : solid))),
    ));
    const htmlPath = join(directory, "fixture.html");
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;background:white}*{animation:none!important;transition:none!important}[data-pixel-group="baseline"] [data-website-feed-icon]{border-width:0!important}[data-pixel-group="baseline"] [data-website-feed-icon]>svg>path{visibility:hidden!important}</style></head><body>${markup}<script>
      const frames = [...document.querySelectorAll('[data-website-feed-icon]')].map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.parentElement.dataset.case, kind: el.closest('[data-pixel-group]').dataset.pixelGroup, zoom: el.parentElement.dataset.zoom, x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const metrics = document.createElement('pre'); metrics.id = 'icon-metrics'; metrics.hidden = true;
      metrics.textContent = JSON.stringify(frames); document.body.append(metrics);
    </script></body></html>`);

    const failures: { dpr: number; id: string; zoom: string; sides: number[] }[] = [];
    const alignmentFailures: { dpr: number; id: string; zoom: string; outsidePixels: number; maxDarkening: number }[] = [];
    let checked = 0;
    for (const dpr of (requestedCase === undefined ? [1, 1.25, 1.5, 2] : [1])) {
      screenshot = join(directory, `dpr-${dpr}.png`);
      const { stdout }: { stdout: string; stderr: string } = await run(chrome, [
        "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-extensions",
        "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
        ...(process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : []),
        `--user-data-dir=${join(directory, `profile-${dpr}`)}`,
        "--window-size=3840,1050", `--force-device-scale-factor=${dpr}`,
        `--screenshot=${screenshot}`, "--dump-dom", pathToFileURL(htmlPath).href,
      ], { encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      const json: string | undefined = stdout.match(/<pre id="icon-metrics"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
      assert(json, "The real icon component must render before checking its borders.");
      const frames = JSON.parse(json) as { id: string; kind: string; zoom: string; x: number; y: number; width: number; height: number }[];
      assert.equal(frames.length, indices.length * 3);
      const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const darkness = (x: number, y: number) => x < 0 || y < 0 || x >= info.width || y >= info.height ? 0 : 255 - data[(y * info.width + x) * 3];
      for (const frame of frames.filter(frame => frame.kind === "white")) {
        const x = frame.x * dpr, y = frame.y * dpr, width = frame.width * dpr, height = frame.height * dpr;
        const sides = [0, 0, 0, 0];
        for (let along = Math.ceil(height * 0.44); along < Math.floor(height * 0.56); along++) {
          for (let across = -2; across <= 2; across++) {
            sides[0] += darkness(Math.floor(x) + across, Math.floor(y) + along);
            sides[1] += darkness(Math.floor(x + width) + across, Math.floor(y) + along);
            sides[2] += darkness(Math.floor(x) + along, Math.floor(y) + across);
            sides[3] += darkness(Math.floor(x) + along, Math.floor(y + height) + across);
          }
        }
        // Sum edge coverage so normal subpixel antialiasing is allowed, while
        // a clipped, displaced, or disproportionately faint edge fails.
        if (Math.min(...sides) === 0 || Math.min(...sides) / Math.max(...sides) < 0.65)
          failures.push({ dpr, id: frame.id, zoom: frame.zoom, sides });
        checked++;
      }
      for (const frame of frames.filter(frame => frame.kind === "black")) {
        const baseline = frames.find(other => other.kind === "baseline" && other.id === frame.id)!;
        const offset = (baseline.x - frame.x) * dpr;
        assert(Math.abs(offset - Math.round(offset)) < 0.01, "Compared icons must have the same fractional pixel position.");
        let outsidePixels = 0;
        let maxDarkening = 0;
        for (let y = Math.floor(frame.y * dpr) - 2; y <= Math.ceil((frame.y + frame.height) * dpr) + 2; y++) {
          for (let x = Math.floor(frame.x * dpr) - 2; x <= Math.ceil((frame.x + frame.width) * dpr) + 2; x++) {
            // Gray drawn inside a solid black silhouette can only lighten it.
            // Darkening pixels outside it reveals a detached/shifted outline.
            const darkening = darkness(x, y) - darkness(x + Math.round(offset), y);
            maxDarkening = Math.max(maxDarkening, darkening);
            // Allow 3% coverage differences from corner antialiasing;
            // a displaced outline produces stronger darkening beyond it.
            if (darkening > 8) outsidePixels++;
          }
        }
        if (outsidePixels) alignmentFailures.push({ dpr, id: frame.id, zoom: frame.zoom, outsidePixels, maxDarkening });
      }
    }
    assert.equal(failures.length, 0, `Missing or displaced icon borders (alignment failures: ${alignmentFailures.length}): ${JSON.stringify(failures.slice(0, 8))}`);
    assert.equal(alignmentFailures.length, 0, `Outlines extend beyond the image silhouette: ${JSON.stringify(alignmentFailures.slice(0, 8))}`);
    console.log(`PASS: complete borders follow the image silhouette in ${checked} position/scale combinations.`);
  } catch (error) {
    if (screenshot) {
      const artifacts = resolve(".scratch/website-icon-border");
      await mkdir(artifacts, { recursive: true });
      await copyFile(screenshot, join(artifacts, "regression-failure.png")).catch(() => {});
    }
    throw error;
  } finally {
    // Only delete the temporary directory created by this invocation.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith("inspora-icon-border-"));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
