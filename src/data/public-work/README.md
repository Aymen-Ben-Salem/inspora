# Public-work reads: archive slices

The server-only entry point is `readWorkPage` in `index.ts`. It supports website, design, and logo archive scopes. Website and logo adapters receive their complete eligible arrays in the page result with `nextCursor: null`. Design adapters receive 16-item pages ordered by creation time and ID, with category/featured selection applied before the limit.

The module owns selection, one evaluation time, assembly, cursor validation, and public caching. Compatibility repositories preserve explicit no-database behavior (development design seeds and an empty logo/website archive), then unwrap the page. Configured failures propagate. Internal presentation helpers remain re-exported for existing non-archive consumers without import cycles. Downloads and other collection reads remain outside this interface.

## Cursor compatibility

Design cursors are opaque version-1 values bound to the design-archive scope, category, view, created-at/ID traversal order, and traversal keys. Malformed values, unsupported versions, binding mismatches, and old unbound design cursors are rejected before selection. This is an intentional Preview compatibility change; a normal fresh archive load omits a cursor and receives a new bound continuation.

## Statement and constraint evidence

Installed Drizzle 0.45.2's `pg-core/query-builders/query.js` prepares and executes one relational statement. `pg-core/dialect.js:buildRelationalQueryWithoutPK` projects relations through lateral joins and JSON aggregates; `neon-http/session.js:NeonHttpPreparedQuery.execute` sends one `client.query` and maps its result. Creator, ordered media, and ordered sections share the candidate statement snapshot. There is no separate card loader or second evaluation time; no consistency alternative is needed.

The Preview tests observe one real SQL statement per archive page. Design fixtures traverse more than two pages with tied timestamps, two media rows per work, stable continuation, no duplicates, full nonfinal pages, and a null terminal cursor. Category/featured selection occurs before the limit. Logo fixtures exceed 16 eligible items without truncation and retain app icons. A controlled website read wraps its statement in a materialized sleep CTE, waits until PostgreSQL reports the sleep, then commits a fixture presentation change. The in-flight result keeps the before snapshot; a fresh read excludes the fixture. Separate injected query/mapping errors fail reads rather than returning partial success.

Existing schema constraints enforce publication dates for published designs, logos, and websites; unique logo media; unique website media roles and section positions; and positive persisted dimensions. Virtual rows cover missing publication dates plus individual null/zero website dimensions and SQL/JSON null previews without weakening constraints. Preview metadata is checked for non-nullness, matching SQL, including non-null scalar JSON; no shape or network validation is added. Legacy screenshots remain stored and ignored for presentation. No schema change is required.

## Caching

The private cached readers register their existing work-family tag (`published-posts`, `published-logos`, or `published-websites`) plus `public-creator-profiles`, with stale/revalidate/expire values of 300/21600/604800 seconds. Existing mutation imports resolve through compatibility re-exports, so their tag strings are unchanged. The adapters have no outer eligibility-sensitive cache. Scheduled publication retains the existing revalidation delay.

Mocked cache checks establish wiring only. A real Next.js Preview runtime invalidation check remains unverified: this session has not exercised an authenticated mutation against a running Preview app. Database consistency tests do not establish runtime cache invalidation.

## Focused verification

Unit/interface and adapter checks:

```powershell
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts
```

PostgreSQL checks require network access and the established exact Preview fingerprint in the ignored environment file:

```powershell
$env:RUN_PREVIEW_PUBLIC_WORK = "1"
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts src/data/public-work/preview.test.ts
```

Fixtures use independent UUIDs, future publications evaluated through the internal test clock, and ID-bounded cleanup. Ordinary runtime cannot see those future publications. The public API exposes no database or clock substitution. Also run typecheck and ESLint on changed TypeScript files.

Verified on 2026-09-22: 64 focused interface/adapter checks and seven real Preview PostgreSQL checks passed. TypeScript and changed-code ESLint are part of the final ticket check. The safeguarded Preview run cleaned up its isolated fixtures. Runtime cache invalidation remains unverified as described above.
