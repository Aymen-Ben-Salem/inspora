# Eligible saved work (ticket 03)

The server-only `readWorkPage` entry point accepts trusted `{ kind: "saved", userId }` scope, optional saved-category filters, `saved-desc` order, and an optional bound cursor. Callers authenticate and authorize the viewer before supplying that scope. `readWorkCounts` accepts the same scope and filters without order or cursor, returning a total and category breakdown. Existing saved repositories preserve explicit no-database empty results and delegate configured reads. Tab counts intentionally remain unfiltered when the selected page has a category filter.

Saved selection binds bookmark membership, viewer identity, publication at one evaluation time, website presentation completeness, and category filtering before the 17-candidate lookahead. A single Drizzle relational statement projects the limited bookmarks and all creator/media/section dependencies. The two added ORM relation descriptors follow existing foreign keys; no database schema, constraints, or migrations change. Design media preserves position ordering and total count while returning its first card image; logo media and website media retain creation ordering, and sections retain position ordering. Mapping errors fail the operation instead of dropping cards.

Counts use one direct grouped eligible-population query without card hydration or pagination. The shared website completeness predicate uses existence checks, so multiple media/sections do not multiply bookmarks or totals. App icons count under Logos. Web designs and Websites remain separate. Logo media integrity failures affect page assembly, not the count population.

Saved pages remain 16 items ordered by bookmark creation time descending and bookmark ID descending. Version-1 cursors bind the viewer, category, order, and traversal keys. PostgreSQL timestamp microseconds are preserved as text in the cursor and compared as timestamps, avoiding gaps caused by JavaScript Date truncation. Legacy unbound saved cursors and mismatched/malformed cursors are rejected before selection. This is an intentional Preview compatibility change: a normal fresh load omits the old cursor and starts a valid traversal. A cursor never grants authorization.

Saved reads are uncached; the feed retains authentication and `private, no-store, max-age=0` headers for successful and error responses. Configured query failures propagate. Saved-status remains membership-only. Bookmark mutations, validation, and optimistic client state are unchanged. An incomplete website disappears from fresh pages and counts while its bookmark persists; repairing it restores its original saved position.

## Focused verification

Verified on 2026-09-22:

- 105 focused interface, saved repository/count, pagination, feed-route and directly affected logo/archive checks passed.
- 18 isolated Preview PostgreSQL saved checks plus the shared completeness SQL/in-memory parity check passed. These cover more than two mixed pages, tied timestamps, microsecond precision, every saved category, multiple viewers/creators, publication boundaries/transitions for all three work families, membership retention and repair, malformed/missing card data, direct counts, and a controlled concurrent presentation edit. Unit failure injection covers query and malformed mapping failures.
- Typecheck and ESLint on changed code passed. The tests use the established exact Preview environment fingerprint and UUID-bounded fixture cleanup.

No full suite, deployment, schema migration, production/main change, or ticket 04/later work was performed. Runtime public-cache invalidation is outside this uncached saved slice; it remains the previously documented archive limitation.

Commands (PowerShell):

```powershell
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts src/data/public-work/reads.test.ts src/data/public-work/saved-reads.test.ts src/data/saved-posts-repository.test.ts src/app/api/saved-posts/feed/route.test.ts src/components/infinite-saved-post-feed.test.tsx src/data/post-pagination.test.ts src/data/logos-repository.test.ts
$env:RUN_PREVIEW_PUBLIC_WORK = "1"
node node_modules/vitest/vitest.mjs run --config src/data/public-work/vitest.config.mts src/data/public-work/saved-preview.test.ts src/data/public-work/preview.test.ts -t 'Preview eligible saved work|matches SQL completeness'
npm run typecheck
```
