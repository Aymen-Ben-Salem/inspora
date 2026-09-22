# 04: Creator-scoped reads and view identities

**What to build:** Visitors see consistent eligible work and filter totals on creator profiles, while creator views use the same eligibility rules through fresh, lightweight work identities. Both profile browsing and analytics retain their existing outward behavior except that incomplete websites are excluded consistently and invalid reads no longer silently produce partial pages.

**Blocked by:** [02: Route design and logo archives through the shared boundary](02-design-and-logo-archives.md).

**Status:** ready-for-agent

**Source:** [Public-work reads spec](../spec.md).

- [x] Route creator profile pages and counts through the shared page/count boundary, adding creator-scope count support independently of saved collection work. Work attribution restricts scope in the same selection as publication, website completeness, and supported filters; attribution does not grant eligibility.
- [x] Preserve 16-item pages ordered by publication time descending, then existing kind rank descending (website, design, logo, app icon), then work ID descending. Preserve existing filter meanings and card/media payloads. Creator counts retain separate logos and app-icons values; Web designs remain distinct from websites.
- [x] Bind versioned cursors to creator identity, filters, and order and reject malformed, mismatched, or unsupported cursors before selection. Each page selects eligible candidates, continuation, and card dependencies in one statement at one evaluation time. Missing or malformed selected data fails the read rather than being silently omitted.
- [x] Counts query the eligible population in one statement without card hydration or a cursor, returning total and filter breakdown without join multiplication. Equivalent fixed-time requests agree with full page traversal; deliberately unfiltered tab-count requests remain supported alongside filtered pages.
- [x] Implement the third public operation: fresh creator-scoped reads returning distinct kind-qualified work identities without full card payloads or pagination. Enumerate eligibility directly in one statement, preserving design/logo publication policy without adding integrity-based population exclusions. Kind-qualified keys prevent collisions between work families; app icons remain a logo kind.
- [x] Replace only creator-view identity selection. Both pre-aggregate and post-aggregate/fallback fingerprint checks call the fresh identity operation. Do not cache identity reads or move analytics provider/event interpretation into the collection module.
- [x] Preserve analytics translation to historical design/logo/website event values, sorting and deduplication for stable fingerprints, provider queries, cutover handling, session deduplication, and environment scoping. Preserve snapshot fallback, the successful snapshot timestamp, and rejection of snapshots whose identity fingerprint changed.
- [x] Distinguish a successful empty identity set from identity-read failure. Eligibility failure produces the existing unavailable creator-view result; configured page/count database or mapping failures preserve existing errors. Explicit no-database behavior remains empty creator pages/counts and unavailable creator views, never a catch-all production failure fallback.
- [x] The module owns creator page/count caches with existing lifetimes and dependency tags for public creator profiles and all three published-work families. Remove stale outer compatibility caches; identity reads remain uncached. Existing work invalidations must refresh cached creator results after presentation/publication changes.
- [x] Extend shared fixtures with more than two pages of valid mixed work, interleaved incomplete websites, timestamp ties, and multiple creators. Verify full traversal without gaps/duplicates, full nonfinal pages, terminal cursors, every filter, creator isolation, and page/count/identity population parity for equivalent scopes, filters where supported, time, and valid persisted presentations.
- [x] Exercise publication boundaries and attribution/publication fixture transitions without invoking identity mutation workflows. Website incompleteness removes it from applicable pages/counts/identities on fresh reads; repair restores it. Reuse SQL/in-memory completeness parity coverage and verify collision-safe identities across work families.
- [x] Actual PostgreSQL coverage validates eligibility before limits/counts/identity enumeration and a controlled concurrent fixture edit. Replace the existing creator-page expectation of silent hydration omission with coherent-read-or-failure behavior. Inject query/mapping failures and retain malformed logo/media integrity coverage without redefining counts or identities.
- [x] Focused analytics tests cover historical event translation, provider failure, both fresh fingerprint checks, eligibility changes during aggregation/fallback, unavailable versus successful empty results, snapshot rejection, and timestamp retention.
- [x] Verify dependency-tag wiring and uncached identity behavior. Run a focused preview runtime check proving existing work invalidation reaches creator pages/counts, or explicitly report runtime cache verification as unavailable.
- [x] Completion of this slice establishes the creator caller's delegation, not ownership/claim/merge or profile-edit orchestration. Keep schema, mutation workflows, provider aggregation changes, new events, UI redesign, and unrelated cleanup out of scope.
- [x] Run only the interface and directly affected creator profile/filter/count/pagination and creator-view cases, plus type checking and changed-code linting. Use established preview database fingerprint safeguards and isolated UUID fixtures without unrelated identity mutation scenarios. Report unavailable real-database checks explicitly; no full suite, migrations, deployment, main, or production changes.

## Comments

### Implementation verification - 2026-09-22

Implemented ticket 04 only on preview/archive-updates. Creator profile pages/counts delegate to the shared module, and creator views use fresh kind-qualified identity reads at both fingerprint checks. Profile mutation and ownership/claim workflows are unchanged.

- 105 focused interface/profile/analytics checks passed. Two legacy-profile checks remained disabled.
- 17 safeguarded Preview PostgreSQL creator checks passed, including three-page traversal, every filter, population parity, collisions, publication/attribution transitions, repair, missing logo media, microsecond traversal, and controlled concurrent editing. Isolated UUID fixtures were cleaned up.
- Two existing shared PostgreSQL completeness/publication parity checks passed.
- Typecheck and changed-code ESLint passed.
- Standards review: no remaining findings after sharing SQL/cursor kind ranks.
- Spec review: no significant findings.
- Runtime Next.js cache invalidation verification was unavailable. Dependency-tag wiring is verified; no authenticated mutation against a running Preview app was exercised.
- Preview compatibility: old unversioned creator cursors are rejected; a fresh load recovers. Website-before-design tie ranking follows this ticket's explicit order, correcting the old implementation's reverse rank.

No full suite, identity-ticket changes, schema/migration, deployment, main, or production changes. Implementation details and checks: [public-work README](../../../src/data/public-work/README.md).
