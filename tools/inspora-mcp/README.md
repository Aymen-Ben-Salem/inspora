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

The server uses the original public catalog by default. An optional approved/local `data/draft-manifest.json` allows a separate `--variant draft` comparison. Source timestamp/media mismatches fail the draft build rather than silently applying stale enrichment. For production-derived refreshes, omit obsolete manifests or have the maintainer rebase them against reviewed current values.

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
- `catalog_status`: date, counts and experimental ranking. The snapshot is **not live synchronized**.

Discovery is bounded to 12,000 JSON characters, details to 10,000. These are prototype limits, not a cap on a host assistant's total token bill. Continuations are query-bound, single-use, non-repeating and expire after 15 minutes. An index refresh invalidates them. No automatic page draining. Insufficient results and unverified alternatives are explicitly labeled.

All source text and input URLs are untrusted data. The server cannot fetch arbitrary URLs, upload images, edit records, or access admin/payment tools. It does not load repository environment files. Results sent to the host remain subject to that host's normal provider usage.

## Refresh and verification

Replace the complete catalog export with a fresh eligible export, preserving a dated backup for comparison. Rebuild both indexes. The builder removes records absent/ineligible in the new export, writes atomically, and reuses vectors only when content/model hashes match. A running server reloads the changed index on the next tool call. A future live service needs explicit invalidation; website cache refreshes do not refresh this index.

```powershell
npm --prefix tools/inspora-mcp test
npm --prefix tools/inspora-mcp run test:protocol
```

The protocol test requires a prepared catalog. It checks inline previews when an eligible local thumbnail is available, and link fallback otherwise. Prepare the repeatable evaluation with:

```powershell
npm --prefix tools/inspora-mcp run evaluate
```

Open `tools/inspora-mcp/evaluation-results/review.html` to score the twenty requests and export the review. The JSON report compares original/draft indexes and lexical/semantic/hybrid retrieval. `--data` and `--output` can select preserved comparison snapshots and a report directory. Latency is local retrieval time with shared query embedding caches; output tokens are explicitly estimated as characters divided by four. Neither measures total client usage. The developer-prepared set is not an independent blind holdout.

Final usefulness acceptance requires team review of 20 requests, at least four useful results among six on sixteen requests. Automated checks and previous known-item retrieval experiments are not that acceptance. Claude Code must be exercised with an authorized team account before claiming client compatibility has been verified; preparing its configuration alone does not count.

## Phase 2

External uploaded reference images are planned, not implemented. Decide formats/size, storage/retention, privacy, access, model/compute cost and visual matching criteria first. Evaluate genuinely external references. Multiple references and motion uploads need separate decisions.

Client references checked November 11, 2026: [Codex MCP](https://developers.openai.com/codex/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server).
