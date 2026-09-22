# Public-work reads: naming and seam

Date: 2026-09-22

Design only. Scope: public-work eligibility on preview/archive-updates. No application changes, migrations, code renames, deployment, or implementation plan are part of this work.

Domain definitions live in [CONTEXT.md](../../CONTEXT.md). This document describes the proposed module; it does not claim the current code already satisfies the contract.

## Names

| Current wording or identifier | Name for this design | Meaning of the correction |
| --- | --- | --- |
| Published-work eligibility and hydration | Public-work reads | The module guarantees eligibility and supplies usable results. |
| publishedWhere | Publication condition | Status and publication time are only part of eligibility. |
| hasCompleteRecording / completeWebsiteRecordingPredicate | Website presentation completeness | The existing checks include favicon and section images. These checks become implementation details. |
| mapPublishedWebsite / mapPublishedLogo | Website / logo presentation mapping | Mapping alone does not establish eligibility; callers must not infer that guarantee from the old names. |
| Post as the mixed-feed umbrella | Work | Design, logo and website identities remain distinguishable. |
| SavedPostCardData | Saved-work card | Bookmark membership and public eligibility are separate facts. |

These are documentation names, not instructions to mechanically rename symbols. Existing post routes, database names and analytics event values remain unchanged. In particular, analytics uses design where the mixed-card representation uses post; translate at the analytics caller rather than changing historical events.

## Observed friction

- [Saved reads](../../src/data/saved-posts-repository.ts) apply status/time checks to pages and counts, then directly map website rows. They omit the website presentation checks used elsewhere.
- [Website reads](../../src/data/websites-repository.ts) check presentation completeness before selecting public work; the mapper can throw for missing recording or section data.
- [Creator work reads](../../src/features/profiles/repository.ts) repeat eligibility in pages and counts, then assemble cards from three kinds of work.
- [Creator views](../../src/analytics/creator-views.ts) repeat publication and website presentation checks to select work identities for aggregation.

This is evidence from source inspection, not a reproduced runtime incident. A shared predicate by itself would remain shallow: every caller would still need to apply it at the correct stage.

## Seam and ownership

Place one public-work reads module between collection callers and database selection/presentation mapping.

    Archive / Saved collection / Creator profile / Creator views
                              |
                    public-work read interface
                              |
       scope + eligibility -> ordering/counting -> presentation
                              |
                     existing database access

Callers choose a supported collection scope, filters, ordering and the result they need. The module executes that request, including applying eligibility before limits and aggregation. Callers do not fetch a page of raw candidates and ask the module to remove invalid entries afterward.

| Inside the module implementation | Outside the module |
| --- | --- |
| Publication condition at one captured evaluation time | Authentication and permission to request a viewer's saved collection |
| Kind-specific presentation eligibility | Editorial publication and submission review writes |
| Scope restriction and eligibility in the same selection | Bookmark creation, removal and optimistic client state |
| Filtering before limits, counts and identity enumeration | Choosing the existing collection ordering and filter vocabulary |
| Executing that ordering, cursor traversal and card assembly | UI layout, detail-dialog navigation and browser loading lifecycle |
| Translating stored kinds into domain work identities | Analytics events, provider queries, deduplication and snapshot fallback |
| Eligibility-sensitive read caching and dependency tags | Existing mutation workflows that trigger invalidation |

Saved-user identity is supplied by a trusted authenticated caller; the module does not establish authorization. Creator attribution restricts scope and does not change eligibility.

## Interface contract

The interface has three result shapes, rather than exposing predicates or mappers:

- **Read a work page:** collection scope, supported filters, ordering and optional cursor produce usable work cards and an opaque continuation cursor.
- **Read work counts:** the same collection scope and filters produce a total and the existing category breakdown over eligible work, independent of the current cursor.
- **Read work identities:** a creator scope produces kind-qualified identities for eligible work without loading full card payloads. Analytics owns their translation into provider event values.

These are responsibilities, not finalized TypeScript declarations. Keep the existing ordering choices: saved collections follow bookmark order; creator and archive queries retain their own established order. Cursor interpretation belongs to the module and must reject invalid or mismatched scope/order requests.

For a fixed dataset and evaluation time, pages, counts and identities use the same eligible population. Each read captures one time for all of its queries; separate requests and cached responses are not promised a shared database snapshot. A publication or media change between requests can legitimately change the population.

Known ineligibility excludes a work from selection before pagination and counts. A database failure or unexpected mapping failure is a failed read, not an empty collection or evidence that all work is ineligible. Caller-specific unavailable displays and existing development fixtures need explicit preservation during a later implementation; they are not redefined by this design.

The module must not leak raw database rows, arbitrary query callbacks, or a check-then-map ordering obligation through its interface. Its depth comes from owning that sequence. This is database-backed behavior, correcting the earlier report's in-process dependency label.

## Eligibility scope and limits

The immediate correction aligns website eligibility across saved reads, creator reads, archives and creator-view identity selection using the existing website presentation requirements. It does not invent new design or logo publication policy.

Design reads currently select on publication status/time. Logo mapping additionally requires a recognized logo kind and media. Any expansion of selection rules for designs or logos needs a separate explicit decision; malformed records remain a read-integrity concern, not silently added business rules.

Website completeness is a check of stored presentation metadata, not a promise that a remote asset exists or is reachable. SQL and in-memory checks are two implementations of one rule. They require parity tests, including null previews, empty sections and missing dimensions; they are not two domain concepts.

Concurrent edits between selection and mapping remain a consistency concern owned by the module. The eventual implementation must choose a consistent read or a bounded retry/failure path rather than return misleading successful partial pages. This design does not prescribe a transaction mechanism or promise snapshot isolation across requests.

Asset download eligibility and bookmark-write validation are adjacent policies observed in the code. They are outside these collection-read changes and receive no implied behavior change from the new names.

## Concrete scenarios

| Scenario | Required collection-read outcome |
| --- | --- |
| Publication enabled with a future publication time | Excluded until that time arrives. |
| Published website has a recording but no favicon | Excluded from pages, counts and creator-view identities. |
| Published website has no sections or a section lacks image dimensions | Excluded even if its recording is complete. |
| Viewer saved a website that later becomes incomplete | Bookmark remains; public saved display and count exclude the work. |
| Incomplete work sorts ahead of valid work | Exclude it before the page limit, so it cannot consume a slot. |
| Website is repaired without changing its bookmark | Eligible again when a fresh read observes the repair. |
| Work is complete but belongs to another creator | Excluded from this creator scope. |
| Database query fails | Failed read; never a successful zero count. |

## Depth and testing

Deleting this module would redistribute eligibility, ordering-before-limits and assembly rules across four callers. That is the deletion test: the module earns its place by concentrating those rules, not by forwarding each old repository call unchanged.

Tests should cross the same read interface as callers and assert the scenarios above. Compare page membership, totals and identity sets under a fixed dataset/time, with more than one page of valid work mixed with incomplete websites. Keep directly relevant mapper integrity checks and real-database query coverage; remove redundant helper-only tests only after equivalent behavior is covered.

Keep database substitution internal. There is no demonstrated need for a public storage port or a new adapter hierarchy; a mock of a query builder alone cannot establish SQL predicate parity. Later validation should use the existing isolated database-test setup and retain a deterministic clock seam.

## Choice and remaining implementation decisions

A predicate-only module is smaller but leaves callers responsible for ordering and mapping. A universal collection framework would absorb unrelated UI and mutation behavior. The proposed read module offers leverage to four callers while keeping eligibility changes local.

No ADR is created: this is a reversible seam definition with no implemented commitment. Future implementation still needs to select file placement, the database consistency mechanism, and precise cache/fallback integration. Those choices do not change the seam or authorize broader refactoring.
