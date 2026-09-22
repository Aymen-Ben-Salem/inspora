# Public-work reads: website archive slice

The server-only entry point is `readWorkPage` in `index.ts`. Ticket 01 supports website-archive scope, publication-desc order, and optional latest/featured selection. It returns every eligible website in `items`, with `nextCursor: null`. Non-null cursors and unsupported scopes, fields, filters, and orders fail before selection. Later tickets can extend this contract; no other scopes are implemented here.

The module owns selection, one evaluation time, assembly, and caching. The archive repository preserves the explicit no-database empty fallback and unwraps the page. Configured failures propagate. Internal presentation helpers remain re-exported by the old repository for existing non-archive consumers without import cycles. Downloads and other collection reads remain outside this interface.

## Statement and constraint evidence

Installed Drizzle 0.45.2's `pg-core/query-builders/query.js` prepares and executes one relational statement. `pg-core/dialect.js:buildRelationalQueryWithoutPK` projects relations through lateral joins and JSON aggregates; `neon-http/session.js:NeonHttpPreparedQuery.execute` sends one `client.query` and maps its result. Creator, ordered media, and ordered sections share the candidate statement snapshot. There is no separate card loader or second evaluation time; no consistency alternative is needed.

The Preview test observes one real SQL statement and checks its results, including an incomplete newest fixture with an appended limit. A controlled read wraps that statement in a materialized sleep CTE, waits until PostgreSQL reports the sleep, then commits a fixture presentation change. The in-flight result keeps the before snapshot; a fresh read excludes the fixture. Separate injected query/mapping errors fail the read rather than returning partial success.

Existing schema constraints enforce unique website media roles and section positions, positive persisted dimensions, and publication dates for published websites. Virtual rows cover individual null/zero dimensions and SQL/JSON null previews without weakening constraints. Preview metadata is checked for non-nullness, matching SQL, including non-null scalar JSON; no shape or network validation is added. Legacy screenshots remain stored and ignored for presentation. No schema change is required.

## Caching

The private cached reader registers `published-websites` and `public-creator-profiles` with stale/revalidate/expire values of 300/21600/604800 seconds. Existing publication and creator mutations invalidate these strings. The adapter has no cache. Scheduled publication retains the existing revalidation delay.

Mocked cache checks establish wiring only. A real Next.js Preview runtime invalidation check remains unverified: this session has not exercised an authenticated mutation against a running Preview app. Database consistency tests do not establish runtime cache invalidation.

## Focused verification

Unit/interface and adapter checks:

```powershell
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts src/data/public-work/reads.test.ts src/data/websites-repository.test.ts
```

PostgreSQL checks require network access and the established exact Preview fingerprint in the ignored environment file:

```powershell
$env:RUN_PREVIEW_PUBLIC_WORK = "1"
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts src/data/public-work/preview.test.ts
```

Fixtures use independent UUIDs, future publications evaluated through the internal test clock, and ID-bounded cleanup. Ordinary runtime cannot see those future publications. The public API exposes no database or clock substitution. Also run typecheck and ESLint on changed TypeScript files.

Verified on 2026-09-22: 33 interface/adapter checks and four real Preview PostgreSQL checks passed, as did `tsc --noEmit` and ESLint on the changed code. The sandbox initially denied database connectivity; the approved network retry passed and cleaned up its fixtures. Standards and ticket-scope reviews found no actionable issues. Runtime cache invalidation remains unverified as described above.
