# 02: Route design and logo archives through the shared boundary

**What to build:** Visitors browse design and logo archives through the same public-work reads boundary as website archives, preserving their existing presentations and browsing behavior. This slice supplies the remaining work-family selection and assembly needed by both mixed saved collections and creator-scoped reads.

**Blocked by:** [01: Read eligible website archives through the public-work module](01-eligible-website-archives.md).

**Status:** ready-for-agent

**Source:** [Public-work reads spec](../spec.md).

- [ ] Both archive adapters delegate actual selection and usable card assembly to the module. Retain publication rules, card payloads, category values, media ordering, creator presentation, and routes. App icons remain a kind of logo; Web-category designs remain distinct from website entries.
- [ ] Design pages retain 16 items ordered by creation time descending then work ID descending, with category and featured selection before limits. Logo archives retain creation-time/ID descending order. Existing complete-array archive callers receive the full eligible collection rather than one page, using the existing page-result shape with a null cursor where appropriate.
- [ ] Client-side archive facets and ordering controls remain outside the module unless they already determine database selection. Scope/filter/order combinations unsupported by the contract are rejected.
- [ ] Implement module-owned versioned opaque cursor encoding, decoding, and validation, binding traversal keys to scope identity, filter, and order. Validate before selection. Reject malformed values, unsupported versions, mismatched bindings, and unbound legacy design/saved cursors; do not infer missing bindings. Existing invalid-cursor presentation is preserved, and normal fresh loads omit a cursor and recover. Report this preview compatibility change.
- [ ] Page selection, continuation candidates, and card dependency hydration use one database statement and one captured evaluation time. Continuation reflects eligible candidates. Preserve mapper integrity checks, including recognized logo kinds and required logo media; malformed records fail a page rather than silently disappearing or introducing new business eligibility rules.
- [ ] The shared boundary provides reusable private selection and assembly for designs, logos/app icons, and websites without caller-owned predicates or repository import cycles. Do not rename stored post identifiers or broaden into unrelated repository cleanup.
- [ ] Design and logo public caches move under module ownership with existing lifetimes and dependency tag strings, including creator presentation dependencies. Remove eligibility-sensitive outer compatibility caches. Existing mutation invalidations still reach the archive results.
- [ ] Explicit no-database behavior remains design development seeds and empty logo archives. Configured query or mapping failures preserve existing error behavior and never trigger seed/empty fallbacks.
- [ ] Extend the interface fixtures and actual PostgreSQL checks for publication immediately before/at/after the fixed time, missing publication dates where the seam allows them, each supported filter, tied timestamps, and duplicate-producing media joins. Traverse more than two design pages with no gaps/duplicates, full nonfinal pages, and the correct terminal cursor.
- [ ] Cover malformed/version/filter/order/scope cursor rejection and fresh-load recovery from legacy cursors. Retain directly relevant existing mapper and pagination tests until equivalent interface behavior is covered.
- [ ] Verify complete-array logo results exceed a page without truncation, archive ordering and card compatibility, logo/app-icon integrity failures, and configuration fallback. Demonstrate existing presentation/publication invalidation refreshes affected archive caches in focused preview runtime checks, or explicitly report that verification as unavailable.
- [ ] Keep schema, mutation workflows, detail reads, downloads, analytics, and UI redesign out of scope. Run only the interface and directly affected archive/pagination cases plus type checking and changed-code linting, with established preview database fixture safeguards. No full suite, migrations, deployment, main, or production changes.
