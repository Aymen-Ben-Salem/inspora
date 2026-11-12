# Inspora local MCP pilot

Retrieval-only stdio MCP for Claude Code and Codex. This branch is for Preview review. There is no hosted MCP endpoint and nothing here edits Inspora content. Uploaded reference images remain required **Phase 2** work.

## Setup

Use Node 24. From the repository root:

```powershell
npm --prefix tools/inspora-mcp ci
npm --prefix tools/inspora-mcp run prepare:model
```

Ask the maintainer for a current public-catalog export and put it at `tools/inspora-mcp/data/catalog.json`. The export has `capturedAt` and `rows`; its SELECT is in `capture.sql`. Run it through an authorized database connection, outside the MCP. Never give testers a production database credential. Runtime data/model files are ignored by Git. The setup command downloads pinned free model weights once; normal retrieval and index building prohibit network requests. Existing November 9 local model assets are reused on the preparation machine. `INSPORA_MODEL_CACHE` can point to another prepared cache.

```powershell
npm --prefix tools/inspora-mcp run build:index
node tools/inspora-mcp/server.mjs
```

The server defaults to `enriched`: current public captions/classifications plus separate visually reviewed search notes from `data/enrichment.json`. These notes never override public fields. Typography is selective for overall website/brand/editorial compositions and lettering subjects; isolated controls and motion studies normally receive none. Exact font names are not guessed. A changed source version, caption, classification, credit or media fingerprint omits the old notes while current public metadata remains searchable. `catalog_status` reports current/stale/missing enrichment counts.

Use `--variant original` for the public-only baseline. The legacy `--variant draft` comparison remains available, but historical public-editorial proposals must not be applied over current content. Old timestamp/media mismatches fail that comparison build. Keep reviewed thumbnails separately in `data/preview-manifest.json` and `data/media/`.

## Connect without changing existing client entries

Replace `C:/path/to/inspora` below with the checkout path. Keep other MCP servers configured.

Claude Code can use a session-only JSON file:

```json
{"mcpServers":{"inspora":{"command":"node","args":["C:/path/to/inspora/tools/inspora-mcp/server.mjs"]}}}
```

Start `claude --mcp-config path/to/inspora-mcp.json`. Use `--strict-mcp-config` only for an isolated pilot session that should load this server alone.

For Codex, add this new entry to the existing config (do not replace the file):

```toml
[mcp_servers.inspora]
command = "node"
args = ["C:/path/to/inspora/tools/inspora-mcp/server.mjs"]
startup_timeout_sec = 30
tool_timeout_sec = 30
```

Session-only Codex overrides are also supported with `-c 'mcp_servers.inspora.command="node"'` and `-c 'mcp_servers.inspora.args=["C:/path/to/inspora/tools/inspora-mcp/server.mjs"]'`.

## Tools and limits

- `search_inspiration`: written idea or existing Inspora link; six results by default, 1–20 allowed; explicit kinds and AND filters; compact or links-only output. Hard filters are never relaxed. Similarity is based on metadata, not a verified visual match.
- `get_work`: selected ID only, bounded details and optional preview. A URL alone does not guarantee image rendering. Inline images are available only for locally prepared thumbnails, capped at 256 KB.
- `catalog_status`: date, counts, enrichment, ranking and synchronization health. Without a configured source it remains a dated offline snapshot.

Discovery is bounded to 12,000 JSON characters, details to 10,000. These are prototype limits, not a cap on a host assistant's total token bill. Continuations are query-bound, single-use, non-repeating and expire after 15 minutes. An index refresh invalidates them. No automatic page draining. Insufficient results and unverified alternatives are explicitly labeled.

All source text and input URLs are untrusted data. The server cannot fetch arbitrary URLs, upload images, edit records, or access admin/payment tools. It does not load repository environment files. Results sent to the host remain subject to that host's normal provider usage.

## Automatic content synchronization

For the local pilot, a maintainer bridge captures only eligible public metadata in a repeatable-read, read-only database transaction every 60 seconds. It serves one validated catalog/enrichment feed on **127.0.0.1 only**, without SQL, paths, credentials or write endpoints. Run from the repository root on the Preview branch, using the existing guarded maintainer environment:

```powershell
node --import tsx scripts/inspora-catalog-feed.mjs --production-public-readonly
```

This command reads the current live public catalog; it does not write live data or change environment files. Keep it on the maintainer machine. The MCP client/server/worker receives no database credentials. A separate hosted Preview delivery path is still needed for teammates on other machines; this loopback bridge is not that service and does not expose a public MCP endpoint.

Configure this environment value once in the client's Inspora MCP entry:

```text
INSPORA_CATALOG_URL=http://127.0.0.1:4174/catalog
```

With the bridge and MCP running, a separate worker checks the exact configured feed every 60 seconds and rebuilds changed vectors offline. Normal expectation: changes arrive within **three minutes** (source polling + client polling + local index build). Additions, edits, deletions, unpublishing, creator visibility and website-completeness changes require no client reinstall, manual refresh or restart. A software upgrade/initial setup is separate from content updates. This local timing is a pilot target, not a hosted-service guarantee.

The worker rejects oversized/malformed/stale/future/out-of-order/conflicting snapshots, retries on the next poll, and atomically publishes complete indexes. Shared-directory writers serialize updates. Failures preserve the last complete index, expose an error and mark the catalog stale after three minutes. Unchanged content preserves continuation cursors; actual content changes invalidate them. `catalog_status.synchronization` reports the last success, failures, worker health and staleness. Stop the bridge when the local session is finished.

The configured feed may alternatively use HTTPS; redirects, credentials and query strings are rejected. Production database credentials belong only in the maintainer bridge, never in team client configuration. Deploying a team/public feed or public MCP requires its own agreed delivery/access setup. External reference uploads remain Phase 2.

## Offline rebuild and verification

For offline maintenance, replace the complete catalog export with a fresh eligible export, preserving a dated backup. Rebuild the indexes. The builder removes absent/ineligible records, writes atomically, and reuses vectors only when content/model hashes match. A running server reloads the index on the next tool call. Website cache refreshes alone do not refresh the MCP index.

```powershell
npm --prefix tools/inspora-mcp test
npm --prefix tools/inspora-mcp run test:protocol
```

The protocol checks require a prepared catalog/model and permission to launch local processes. They cover default enriched retrieval/previews plus a single running MCP session receiving fixture HTTP additions, edits, eligibility removals, enrichment invalidation and outage/out-of-order recovery without restart. These tests do not mutate live data. Prepare the repeatable evaluation with:

```powershell
npm --prefix tools/inspora-mcp run evaluate
```

Open `tools/inspora-mcp/evaluation-results/review.html` to score the twenty requests and export the review. The JSON report compares public-only/enriched indexes and lexical/semantic/hybrid retrieval. `--data` and `--output` can select preserved comparison snapshots and a report directory. Latency is local retrieval time with shared query embedding caches; output tokens are explicitly estimated as characters divided by four. Neither measures total client usage. The developer-prepared set is not an independent blind holdout.

Final usefulness acceptance requires team review of 20 requests, at least four useful results among six on sixteen requests. Automated checks and previous known-item retrieval experiments are not that acceptance. Claude Code must be exercised with an authorized team account before claiming client compatibility has been verified; preparing its configuration alone does not count.

## Phase 2

External uploaded reference images are planned, not implemented. Decide formats/size, storage/retention, privacy, access, model/compute cost and visual matching criteria first. Evaluate genuinely external references. Multiple references and motion uploads need separate decisions.

Client references checked November 11, 2026: [Codex MCP](https://developers.openai.com/codex/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server).
