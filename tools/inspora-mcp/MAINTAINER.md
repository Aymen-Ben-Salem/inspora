# Inspora MCP: technical setup and maintenance

Team testers should start with the [short setup guide](README.md). This reference is for the maintainer or coding assistant performing setup.

## Assisted setup checklist

1. Confirm the intended client and project path. Inspect existing Inspora/client configuration before editing; preserve other MCP connections and back up any file being changed.
2. Check for Node 24, the repository, and the privately supplied `team-connection.json`. If one is missing, report that specific prerequisite. Never request credentials in chat or print the connection file. Clients need only catalog access, never database/storage/provider credentials.
3. Use the setup commands below. Reuse compatible installed dependencies and prepared model files. Store the access file in ignored `tools/inspora-mcp/data/`; bootstrap the catalog with `connect.mjs`.
4. Configure only the selected client using absolute paths and the connection examples below. The client launches `server.mjs`; a separate manually running server is unnecessary. Explain any required client restart/reopen. If client configuration cannot be modified in the current environment, report the limitation instead of claiming success.
5. Verify `catalog_status` and one small search through the actual client when available. Report configuration-only verification separately from a successful client call. Avoid repeating the full benchmark or spending paid model tokens beyond the small connection check.

Completion means the selected client can reach Inspora and return credited public links. A successful command alone is not a completed team trial.

## Planned easier connection

Phase 1E will evaluate a hosted MCP URL before the team trial and Phase 2 reference uploads. Target: add the connection, authorize access, search; no repository or model download for testers. Hosting, authentication, shared-index freshness, actual operating cost and clean-machine client checks must be settled before claiming this experience works. The current local MCP and one-minute refresh remain unchanged. The catalog feed URL below is not an MCP endpoint.

Retrieval-only stdio MCP for Claude Code and Codex, supplied by an authenticated production catalog feed. The MCP runs locally; the catalog service runs online. The MCP page remains unpublished. Uploaded reference images remain required **Phase 2** work.

## Setup

Use Node 24. From the repository root:

```powershell
npm --prefix tools/inspora-mcp ci
npm --prefix tools/inspora-mcp run prepare:model
```

For shared delivery, the maintainer supplies a `team-connection.json` containing `url: "https://www.inspora.design/api/inspora/catalog"` and a catalog-only `token`. Keep it in the ignored `tools/inspora-mcp/data/` directory. Access is authenticated independently of the unpublished MCP page.

```powershell
node tools/inspora-mcp/connect.mjs --connection tools/inspora-mcp/data/team-connection.json
```

`connect` is a one-time catalog bootstrap after the model is prepared. Then use the same connection file at every launch. No database, storage or Vercel credentials belong in team configuration. The server checks once per minute while running; its target is under three minutes for ordinary catalog changes, excluding the one-time model/setup work or service outages. Software updates are separate from content updates. Runtime data/model files are ignored by Git. The setup downloads pinned free model weights once; normal retrieval and index building use them offline. `INSPORA_MODEL_CACHE` can point to another prepared cache.

The server defaults to `enriched`: current public captions/classifications plus separate visually reviewed search notes. These notes never override public fields. Typography is selective for overall website/brand/editorial compositions and lettering subjects; isolated controls and motion studies normally receive none. Exact font names are not guessed. A changed source version, caption, classification, credit or media fingerprint omits the old notes while current public metadata remains searchable. `catalog_status` reports current/stale/missing enrichment counts. New or invalidated hidden prose still needs generation/review; automatic delivery does not invent it. Inline thumbnails remain optional local assets from the reviewed bundle; fresh or changed media use current public preview links until reviewed thumbnails are prepared.

Offline alternative: place a maintainer-provided `{capturedAt,rows}` public export at `data/catalog.json`, reviewed notes at `data/enrichment.json`, and run `npm --prefix tools/inspora-mcp run build:index`. Never give testers the database credential.

Use `--variant original` for the public-only baseline. The legacy `--variant draft` comparison remains available, but historical public-editorial proposals must not be applied over current content. Old timestamp/media mismatches fail that comparison build. Keep reviewed thumbnails separately in `data/preview-manifest.json` and `data/media/`. New thumbnail manifests use `version: 2` and `mediaFingerprint(row)` from `enrichment.mjs` for `sourceVersion.mediaMetadataSha256`; this ignores JSON key order while rejecting actual media changes. Legacy unversioned/version-1 manifests still use their original hash format.

## Connect without changing existing client entries

Replace `C:/path/to/inspora` below with the checkout path. Keep other MCP servers configured.

Claude Code can use a session-only JSON file:

```json
{"mcpServers":{"inspora":{"command":"node","args":["C:/path/to/inspora/tools/inspora-mcp/server.mjs","--connection","C:/path/to/inspora/tools/inspora-mcp/data/team-connection.json"]}}}
```

Start `claude --mcp-config path/to/inspora-mcp.json`. Use `--strict-mcp-config` only for an isolated pilot session that should load this server alone.

For Codex, add this new entry to the existing config (do not replace the file):

```toml
[mcp_servers.inspora]
command = "node"
args = ["C:/path/to/inspora/tools/inspora-mcp/server.mjs", "--connection", "C:/path/to/inspora/tools/inspora-mcp/data/team-connection.json"]
startup_timeout_sec = 30
tool_timeout_sec = 30
```

Session-only Codex overrides are also supported. Include the same absolute `--connection` file argument when using the shared feed.

## Tools and limits

- `search_inspiration`: written idea or existing Inspora link; six results by default, 1–20 allowed; explicit kinds and AND filters; compact or links-only output. Hard filters are never relaxed. Similarity is based on metadata, not a verified visual match.
- `get_work`: selected ID only, bounded details and optional preview. A URL alone does not guarantee image rendering. Inline images are available only for locally prepared thumbnails, capped at 256 KB.
- `catalog_status`: date, counts, enrichment, ranking and synchronization health. Without a configured source it remains a dated offline snapshot.

Discovery is bounded to 12,000 JSON characters, details to 10,000. These are prototype limits, not a cap on a host assistant's total token bill. Continuations are query-bound, single-use, non-repeating and expire after 15 minutes. An index refresh invalidates them. No automatic page draining. Insufficient results and unverified alternatives are explicitly labeled.

All source text and input URLs are untrusted data. The server cannot fetch arbitrary URLs, upload images, edit records, or access admin/payment tools. It does not load repository environment files. Results sent to the host remain subject to that host's normal provider usage.

## Automatic content synchronization

Shared delivery uses `GET https://www.inspora.design/api/inspora/catalog`. The route authenticates a catalog-only bearer token before database/storage reads and rejects query parameters or other hostnames. It has no write tools or arbitrary URL fetches. A dedicated Preview alias or Vercel bypass secret is not required.

The server-only `INSPORA_CATALOG_SOURCE_DATABASE_URL` uses the dedicated `inspora_catalog_reader` role, with SELECT on `public.inspora_mcp_public_catalog` only. Production backend/source setup was authorized November 13. The route refuses owner/writable logins and captures in a read-only repeatable-read transaction. Set it and `INSPORA_CATALOG_TOKEN` as sensitive production variables, independently of the application's `DATABASE_URL`. The source requires production, main and the known production storage/database identities. `scripts/provision-inspora-catalog.mjs` has a dry-run default; its `--apply --confirm-production` mode creates absent objects and verifies the restricted grants. Credentials stay in ignored `.env.inspora-catalog.local` and the service's secret configuration.

Reviewed enrichment is one private production R2 object, `mcp/phase1/enrichment-v1.json`, in the existing private submissions bucket. `node --import tsx scripts/publish-inspora-enrichment.mjs` performs a dry run; `--apply --confirm-production` creates the initial object. Replacements require `--expected-sha256` and use conditional writes, an exact local backup and verified receipts. No account/submission objects are listed or modified. The authenticated feed filters rows and notes by current public eligibility and fails closed on malformed/oversized/unavailable data. Clients retain their last complete index through failures and expose freshness/error status.

While the MCP is running, a separate worker checks the configured feed every 60 seconds and rebuilds changed vectors offline. The ordinary-update target is **under three minutes**, including local index rebuilding. Additions, edits, deletions, unpublishing, creator visibility and website-completeness changes require no client reinstall, manual refresh or restart. Service outages and first-time setup are outside this timing target. A software upgrade is separate from content updates.

The worker rejects oversized/malformed/stale/future/out-of-order/conflicting snapshots, retries on the next poll, and atomically publishes complete indexes. Shared-directory writers serialize updates. Failures preserve the last complete index, expose an error and mark the catalog stale after three minutes. Unchanged content preserves continuation cursors; actual content changes invalidate them. `catalog_status.synchronization` reports the last success, failures, worker health and staleness.

The configured feed may alternatively use HTTPS; redirects, URL credentials and query strings are rejected. Shared authentication uses `INSPORA_CATALOG_TOKEN` or the connection file, never a secret in the URL. A shared catalog feed is not a hosted MCP endpoint: Claude Code and Codex still run the stdio server locally. External reference uploads remain Phase 2.

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

The user confirmed the prepared search review on November 12; no numerical score sheet was supplied. The benchmark remains at least four useful results among six on sixteen of twenty requests. Agent-run Codex and Claude Code checks have passed, but the user's and teammates' own installation/use has not yet been tested. Preparing configuration alone is not a successful client check.

## Phase 2

External uploaded reference images are planned, not implemented. Decide formats/size, storage/retention, privacy, access, model/compute cost and visual matching criteria first. Evaluate genuinely external references. Multiple references and motion uploads need separate decisions.

Client references checked November 11, 2026: [Codex MCP](https://developers.openai.com/codex/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server).
