# Public-work reads refactor

Status: ready-for-agent
Date: 2026-09-22
Target: preview/archive-updates

## Problem Statement

Visitors should see usable, publicly eligible work consistently across archives, creator profiles, saved collections, and the work population used for creator views. Today, saved pages and counts check publication without checking website presentation completeness. Other callers repeat those checks and assemble cards separately; creator pages can silently discard selected work during hydration. This can produce misleading totals, underfilled pages, or mapping failures.

This is a source-confirmed inconsistency, not a claim that a production incident has been reproduced. Published work and publicly eligible work are distinct: attribution and bookmark membership restrict collection scope, but neither grants eligibility.

## Solution

Introduce one server-only public-work reads module that owns collection scope, publication and presentation eligibility, selection before limits and aggregation, ordering, cursor traversal, and usable result assembly. Archive, saved collection, creator profile, and creator-view callers request pages, counts, or identities through that interface.

An incomplete website disappears from public pages, totals, and creator-view identity selection. Its bookmark remains. When a fresh read observes repaired presentation metadata, the website returns in its existing collection position. Database or integrity failures remain failures rather than successful empty results.

## User Stories

1. As a visitor, I want draft and archived work excluded, so that collections show only published work.
2. As a visitor, I want future publication excluded until its publication time arrives, so that scheduled work is not exposed early.
3. As a visitor, I want websites without a recording, poster, or preview excluded, so that displayed websites have their required presentation.
4. As a visitor, I want websites without a favicon excluded, so that displayed websites meet the same requirements across collections.
5. As a visitor, I want websites with no sections or incomplete section images excluded, so that the whole website presentation is usable.
6. As a visitor, I want retained legacy screenshots to coexist with complete recording presentations, so that otherwise eligible websites remain visible.
7. As a viewer, I want my saved collection restricted to my bookmarks, so that another viewer's membership does not affect my results.
8. As a viewer, I want an incomplete saved website hidden without deleting its bookmark, so that temporary presentation problems do not erase my saved work.
9. As a viewer, I want repaired saved work to return without saving it again, so that my original selection is preserved.
10. As a viewer, I want saved work ordered by bookmark time, so that newly saved work remains first.
11. As a viewer, I want category totals to count eligible saved work, so that they agree with the collection I can browse.
12. As a visitor, I want creator collections restricted to that creator's work, so that credit is accurate.
13. As a visitor, I want creator filters to distinguish designs, websites, logos, and app icons as they do today, so that existing browsing choices remain useful.
14. As a visitor, I want a Web-category design distinct from a website entry, so that filters retain their existing meaning.
15. As a visitor, I want incomplete work excluded before the page limit, so that it cannot consume a slot ahead of eligible work.
16. As a visitor, I want stable ordering through tied timestamps, so that traversal does not skip or repeat work on an unchanged dataset.
17. As a visitor, I want counts independent of my current cursor, so that totals describe the selected collection rather than the remaining page.
18. As a visitor, I want archive ordering and featured filtering preserved, so that the refactor does not rearrange familiar browsing behavior.
19. As a creator, I want views calculated using eligible, kind-qualified work identities, so that incomplete websites cannot contribute to my current aggregate population.
20. As a creator, I want existing analytics deduplication and snapshot fallback retained, so that moving eligibility does not change event interpretation or outage behavior.
21. As a visitor, I want a failed read reported through the existing unavailable or error presentation, so that an outage does not look like an empty collection.
22. As a maintainer, I want all collection reads to enforce the same eligibility sequence, so that adding a caller does not require remembering separate predicates and mappers.
23. As a maintainer, I want cache invalidation to follow all work dependencies, so that fresh collection reads reflect publication and presentation changes.
24. As a developer, I want existing no-database development behavior preserved explicitly, so that local fixtures do not become accidental production failure fallbacks.

## Implementation Decisions

- **Boundary and placement:** implement a cohesive public-work reads module in the server data layer. Its private implementation owns query construction and presentation mapping. Existing repository exports may remain as compatibility adapters. They must delegate actual collection selection; forwarding four unchanged repositories through a new facade does not satisfy this refactor. Do not expose database rows, SQL predicates, arbitrary query callbacks, or check-then-map obligations to collection callers. Keep database substitution and the deterministic clock internal; no public storage port or adapter framework is required.

- **Three operations:** a work-page read accepts a discriminated collection scope, supported filters, its supported ordering, and an optional opaque cursor, and returns usable cards with a nullable continuation cursor. A work-count read accepts the same scope and filters and returns a total plus the applicable category/filter breakdown, without a cursor. A work-identity read accepts creator scope and returns distinct kind-qualified identities without loading full card payloads. App icons remain a kind of logo. Unsupported scope/filter/order combinations are rejected rather than ignored.

- **Collection scope:** support the existing design, logo, and website archives; a trusted caller's saved-user scope; and a creator-ID scope. The caller authenticates and authorizes saved access before supplying the user ID. Bind bookmark or creator restrictions into the same selection as eligibility. Saved-status lookup remains a membership read and is not converted into an eligibility read.

- **Selection:** capture one evaluation time per database read and reuse it throughout that operation. Publication requires published status and a non-null publication time at or before that time. Apply collection scope, publication, website completeness, and supported selection filters before ordering limits, counts, or identity enumeration. Counts and identities query their eligible population directly without card hydration or pagination. Prevent joins to media or sections from multiplying work or counts.

- **Website presentation completeness:** require a recording with a nonempty poster and a non-null video preview, a favicon, at least one section, and an image URL and dimensions for every section. Preserve the existing stored-metadata rule, including exclusion of SQL NULL and JSON null previews, empty poster/image strings, and absent or zero section dimensions. Existing schema constraints handle positive dimensions in persisted valid records. Ignore retained full-page screenshots for presentation. Do not add network probes, stronger preview-shape validation, or new media publication rules. SQL selection and the in-memory integrity check implement the same rule and must have parity coverage.

- **Design and logo policy:** retain existing publication selection rules. Retain mapper integrity checks, including recognized logo kinds and required logo media. Malformed records that prevent usable card assembly fail a page read; do not silently add business eligibility rules to counts or identities to hide them. Population parity is evaluated for valid persisted presentations; a failed card read does not establish a different eligible population. Kind-qualified identity keys prevent collisions between work families.

- **Ordering and filters:** saved pages remain 16 items ordered by bookmark creation time descending, then bookmark ID descending. Creator pages remain 16 items ordered by publication time descending, then the existing kind rank descending (website, design, logo, app icon), then work ID descending. Design archive pages retain 16 items ordered by creation time descending then ID descending, including category and featured selection. Logo archives retain creation time then ID descending; website archives retain publication time then ID descending and featured selection. Existing complete-array archive callers must still receive their full collection through an adapter, with no truncation to one page and no new browser pagination requirement. Existing client-side archive facets and ordering controls remain outside the module unless they already determine database selection. The page operation may return a complete archive collection with a null cursor for those existing complete-array consumers; do not introduce a fourth public result shape.

- **Counts:** preserve saved categories, including Logos containing app icons and Websites distinct from the Web design category. Preserve creator filter breakdowns, including separate logos and app-icons values. Within the same scope, filters, fixed time, and dataset, totals must match the eligible population traversed by pages. Existing tab-count callers may request unfiltered counts separately from a filtered page; that deliberate difference in request is not a parity failure.

- **Cursor contract:** the module owns encoding, decoding, and validation. Use a versioned opaque cursor containing traversal keys and binding to scope identity, filter, and order. Reject malformed, unsupported-version, and mismatched cursors before selection; a cursor never authorizes access. Preserve existing invalid-cursor handling in caller adapters. Old saved/design cursors lack those bindings: reject them rather than infer missing bindings, and ensure a normal fresh load starts without a cursor. Include this preview compatibility change in implementation reporting. No persistent cursor migration is needed.

- **Read consistency:** select the limited eligible population and hydrate its card dependencies in one database statement, using an internal CTE/subquery and relational or aggregated projections as appropriate. Compute continuation from eligible candidates in that statement. This chooses statement-level database consistency instead of the current candidate query followed by independent hydration queries. Do not call a standalone card loader that captures a new time or reads outside that statement. Map the returned data without silently dropping missing or invalid candidates; unexpected inconsistencies fail the operation. Count breakdowns and identity enumeration each use a single statement. No snapshot is promised across separate page/count requests or cached results. If implementation evidence proves a statement cannot express the required projection with the existing driver, document the evidence and a bounded consistency alternative before replacing this decision; do not default to repeated filtering of partial pages.

- **Caching:** the module owns caching of eligibility-sensitive collection results. Preserve existing public collection lifetimes initially (300-second stale window, 21,600-second revalidation, 604,800-second expiry) and existing dependency tag strings, so current mutation invalidations continue to reach readers. Creator mixed pages and counts depend on public creator profiles and all three published-work tags; archive results depend on their work kind and creator presentation dependencies. Avoid an outer compatibility cache that can retain stale results after the module is invalidated. Saved collection reads remain private and uncached; identity reads remain fresh, including both analytics fingerprint checks. Do not add caching around identities that defeats those checks. A fresh evaluation observes publication time; cached responses retain existing time-based revalidation semantics, with no new promise of immediate scheduled-publication visibility. Mutation workflows continue to trigger their existing invalidations.

- **Failure and fallback integration:** core database reads propagate configuration, query, and unexpected mapping errors. Compatibility adapters preserve existing explicit no-database behavior: design archive development seed data; empty logo/website archives; empty saved and creator pages/counts; and unavailable creator views. These are configuration fallbacks, never catch-all handling for a configured database failure. Preserve existing route errors, private saved headers, and unavailable UI. Do not cache failure as an empty eligible population.

- **Creator views:** replace only eligible identity selection with the new interface. Analytics retains translation into historical event values (design, logo, website), sorting/deduplication needed for a stable fingerprint, provider queries, cutover handling, session deduplication, environment scoping, and snapshot fallback. Both pre-aggregate and post-aggregate/fallback identity checks use the fresh read operation. Eligibility failure yields unavailable through the existing caller; a successful empty identity set remains distinct from a failed read. Preserve the successful snapshot timestamp and rejection of a snapshot for a changed identity fingerprint.

- **Compatibility and extraction:** preserve card payloads, media ordering, category values, public routes, and analytics event names. Existing stored post identifiers need no mechanical rename to work. Move or privatize mapping/query helpers only as necessary for the read boundary; avoid import cycles between the new module and compatibility repositories. Detail-by-slug reads, adjacent navigation, slug enumeration, and asset download policies are not added to the three-operation interface in this candidate.

- **Schema:** no migration, backfill, new table, index, or persisted eligibility flag is planned. Existing publication fields, work attribution, bookmark targets, media, and sections express the requirements. Eligibility remains derived at read time. If actual query or constraint evidence proves a schema change necessary, record the failing requirement, why query-only approaches cannot satisfy it, and the smallest proposed change before revising this assumption. Performance speculation alone is not evidence for a migration.

## Testing Decisions

- Use the public-work read interface as the primary seam. Assert externally observable membership, ordering, payload usability, totals, continuation behavior, and identity sets. Avoid tests that merely mirror helper calls or exact query-builder chains.
- Use a deterministic internal clock and a shared fixture population with more than two pages of valid mixed work, incomplete websites interleaved ahead of valid work, tied timestamps, multiple creators, and multiple saved users. Traverse every page; assert no gaps or duplicates, full nonfinal pages, the expected final cursor, and page/count/identity parity for equivalent scopes and filters.
- Exercise publication status and time immediately before, exactly at, and after the boundary; missing publication dates where the test seam permits them; creator attribution and saved-user isolation; each supported filter; and app-icon versus logo treatment. Verify Web designs and website entries remain distinct.
- Cover each website completeness failure independently, including SQL NULL and JSON null previews, missing/empty poster, missing recording/favicon, no sections, empty image URL, missing dimensions, and zero dimensions where constraints permit a virtual-row test. Verify one incomplete section excludes the entire website and complete-plus-legacy media remains eligible.
- Test saving membership independently from presentation: after a fixture website becomes incomplete, a fresh read excludes it from all applicable results while its bookmark persists; repair restores it at its original saved order. Test publication and attribution changes as fixture data transitions, without exercising or refactoring creator identity mutation workflows.
- Use actual PostgreSQL query coverage to validate filtering before limits and SQL/in-memory rule parity. Follow existing preview environment fingerprint checks and isolated UUID fixture setup/cleanup. The creator-view database suite provides fixture-isolation prior art; the profile repository's virtual-row completeness check provides parity prior art. Extend these patterns for the new interface, without running unrelated claim or identity mutation scenarios. Query-builder mocks alone are insufficient. Virtual rows can cover values rejected by schema constraints without weakening those constraints.
- Validate statement consistency under a controlled concurrent fixture edit: a read returns a coherent before/after population or fails, never a successful page with a selected item silently removed during mapping. Inject query and mapping failures internally to verify failed reads, not zero counts or partial pages. Cover malformed logo/media data as integrity errors without redefining eligibility.
- Keep focused caller checks for archive shape/order and seed fallback, saved feed authentication/private errors and counts, creator filter/count adapters, and creator-view event translation, fingerprint rechecks, provider failure, and snapshot timestamp retention. Existing repository, pagination, feed-route, and creator-view tests provide prior art. Update the old creator-page test that expects silent omission after hydration to the new coherent-read/failure contract.
- Verify dependency tags and uncached saved/identity behavior. Demonstrate that existing work invalidation reaches cached creator results and archive results after a presentation/publication change. Mocked tag registration establishes wiring only; use a focused preview runtime cache check for invalidation behavior when implementing, and explicitly report if that check cannot run.
- Retain directly relevant mapper integrity and cursor validation checks until equivalent interface behavior is covered. Test mismatched user/creator, filter, order, version, malformed values, and a fresh-load recovery from rejected legacy cursors.
- For implementation, run only the new interface suite and directly affected archive, saved, profile, and creator-view cases, plus type checking and linting of changed code. Run isolated real-database cases with the established preview safeguards. Do not run the full suite, deploy, or run database migrations by default. If preview access is unavailable, report real-database parity/consistency as unverified rather than treating mocks as proof.
- This deliverable is documentation only: verify its content, source links, template, scope, and status. Application tests are unnecessary until implementation.

## Out of Scope

- Creator identity mutations are a separate candidate: ownership initialization, creator claims/merges, attribution mutation orchestration, usernames and aliases, profile/avatar edits, account lifecycle, and related locking/transactions. Reading current creator attribution and presentation does not bring those writes into this refactor.
- Bookmark creation/removal, save validation, saved-status membership lookup, optimistic client state, editorial publication, submission review, and asset download eligibility.
- UI redesign, new navigation, new archive facets, new analytics events, provider aggregation changes, or changing historical event values.
- General repository cleanup, a universal collection framework, public storage adapters, remote asset verification, or new design/logo eligibility policy.
- Schema migrations unless implementation evidence proves one required; production changes, deployment, or changes to main.

## Further Notes

Source of domain language: [CONTEXT.md](../../CONTEXT.md).
Source design: [Public-work reads: naming and seam](../published-work-eligibility/spec.md).
Tracker conventions: [Local Markdown issue tracker](../../docs/agents/issue-tracker.md) and [triage labels](../../docs/agents/triage-labels.md).

This spec turns the design into an implementation candidate and leaves the source design intact. The source document's design-only restriction described that earlier task; it is not an implementation restriction on this new candidate. No relevant ADR directory was present during inspection.

Completion requires all four collection callers to delegate their applicable public-work reads, website eligibility to apply before limits/counts/identity enumeration, no successful partial page caused by hydration omission, preserved caller compatibility/fallback behavior, and the focused checks above. Deleting the module should redistribute these sequencing and assembly rules across callers; if deletion merely removes forwarding functions, the intended refactor is incomplete.

The testing seam is retained from the source design. Exact private symbol names are implementation choices; they do not justify expanding scope to creator identity mutations or schema work.
