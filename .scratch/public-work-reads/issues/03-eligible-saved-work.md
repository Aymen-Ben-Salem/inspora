# 03: Browse and count eligible saved work

**What to build:** An authorized viewer can browse and count their publicly eligible saved work consistently. Incomplete websites disappear from fresh collection reads without losing bookmarks, and repaired websites return in their original saved position.

**Blocked by:** [02: Route design and logo archives through the shared boundary](02-design-and-logo-archives.md).

**Status:** ready-for-agent

**Source:** [Public-work reads spec](../spec.md).

- [x] Route saved pages and category totals through the module's page and count operations. The caller authenticates and authorizes access before supplying trusted saved-user scope. Bind bookmark membership and user identity into the same selection as publication, website completeness, and supported filters.
- [x] Pages remain 16 items ordered by bookmark creation time descending then bookmark ID descending. Eligibility is applied before limits, so incomplete websites interleaved ahead of valid work cannot consume slots. Bind cursors to the saved user, filters, and order; a cursor never authorizes access.
- [x] Select eligible candidates, continuation, and card dependencies in a single statement with one evaluation time. Unexpected missing or malformed card data fails the operation rather than returning a successful partial page. Preserve design/logo mapper integrity without adding count-only eligibility exclusions.
- [x] Counts use a single direct eligible-population statement without pagination or card hydration, returning total and applicable category breakdown. They are cursor-independent and do not multiply through media/section joins. Logos includes app icons; Websites remains separate from the Web design category. Unfiltered tab counts may deliberately accompany filtered page requests.
- [x] Saved collection reads remain private and uncached. Preserve feed authentication, existing private headers, invalid-cursor handling, errors, and explicit no-database empty pages/counts. Configured database failures are errors, never successful zero totals or empty pages.
- [x] Saved-status lookup remains a membership read. Do not change bookmark creation/removal, save validation, optimistic client state, or other mutation workflows.
- [x] With more than two pages of valid mixed work, tied bookmark timestamps, incomplete websites, multiple users, and multiple creators, traverse every page and verify isolation, ordering, full nonfinal pages, no gaps/duplicates, correct terminal cursor, usable payloads, and page/count parity for equivalent fixed-time scope and filters.
- [x] Independently cover supported saved filters, design/logo/app-icon distinctions, Web designs versus website entries, publication boundaries, and publication fixture transitions. A fresh read after website incompleteness excludes the website from pages and counts while preserving its bookmark; repair restores its original position without resaving.
- [x] Test mismatched user/filter/order/version and malformed cursors before selection, reject legacy unbound saved cursors, and verify fresh-load recovery. Confirm authorization cannot be bypassed using another viewer's cursor.
- [x] Actual PostgreSQL tests prove mixed selection before limits and correct aggregation. Cover coherent behavior under a controlled concurrent fixture edit and injected query/mapping failures, including malformed logo media. Use shared completeness parity coverage rather than duplicating implementation-shaped tests.
- [x] Run focused interface, saved repository/count, pagination, and feed-route cases plus type checking and changed-code linting. Use established preview database fingerprint checks and isolated UUID cleanup; explicitly report unavailable database consistency/parity checks. Stay on preview with no schema changes, deployment, full-suite run, or production/main changes.

## Comments

Implemented 2026-09-22 on `preview/archive-updates`, limited to ticket 03. Saved pages/counts now use the public-work boundary with one-statement eligible selection/hydration, viewer/filter-bound cursors, direct category aggregation, and private failures/fallbacks. Legacy unbound saved cursors require a normal fresh load. PostgreSQL cursor keys retain microseconds to prevent tied-bookmark gaps. Existing bookmark mutations, membership reads and optimistic state are unchanged.

Validation: 105 focused tests and 19 safeguarded Preview PostgreSQL checks passed (18 saved checks plus shared completeness parity), along with typecheck and changed-code lint. Database tests include concurrent fixture edits, publication transitions for all work families, every saved category, multiple users/creators, website repair restoring saved position, missing logo media without count exclusions, and precision regression coverage. Isolated fixtures were cleaned up. No required saved database consistency/parity check is unavailable. No full-suite run, migration, deployment, main/production change, or ticket 04/later work.

Implementation details and commands: [Eligible saved work](../../../src/data/public-work/SAVED.md).

Review: independent Standards and Spec reviews found no blocking issues. The one maintainability suggestion (centralize saved page size) was addressed.
