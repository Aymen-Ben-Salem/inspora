# Agent instructions

## Current work boundary

Work on `preview/archive-updates` by default. Keep new features, including the Inspora MCP and its page, on Preview for user/team review. Preserve existing local changes and environment files when preparing work.

Merge or push to `main`, deploy/promote to production, or change live data/configuration only when the user explicitly authorizes that scope. The normal release gate is the user saying the migration is ready. Preview publishing is separate from production approval. Honor authorization already given in the current task without asking again.

The November 11, 2026 exception authorizes description and classification corrections across all live works that need them, following the approved fifteen-example editorial approach. The user explicitly clarified that classification includes the main category plus Industry, Style and Color. Use the existing taxonomy and visible/source evidence; leave uncertain labels unset. This exception does not authorize publishing the MCP, its page, search-only prose, technologies, or unrelated fields to production. Keep exact before/after records and reject stale content updates. Refresh Preview from current live public content when requested, while preserving Preview-only work, environment configuration and unrelated account/payment data. MCP source may be pushed to the public repository's Preview branch; the user clarified that local/Preview development does not require private source hosting.

Never stage or commit `.scratch/`, `/docs/`, or environment files; they are local-only planning notes. Commit application sources, tests, and tracked configuration only.

## Testing scope

Run the smallest set of tests and checks that meaningfully validates the change, covering the changed behavior and directly affected callers or integrations. Select relevant test files or cases rather than running the entire suite by default. For documentation-only changes, verify the edited content and links; app tests are unnecessary.

Broaden testing only when shared behavior, a failure, an unresolved regression risk, or an explicitly required repository check justifies it. Explain the reason before running broader checks. Skip unrelated tests and stop once relevant checks pass; repeat checks only after further changes or new evidence warrants it. In the completion report, state what was checked and any material validation limits.

## Agent skills

### Issue tracker

Track issues and specs as local Markdown under `.scratch/<feature>/`. Before reading, creating, or updating tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage status strings. Before triaging tickets, read `docs/agents/triage-labels.md`.

### Domain docs

Use single-context domain documentation: root `CONTEXT.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.

### Sponsorship billing

Sponsorship is implemented and live. Before changing checkout, Stripe resources, tax settings, or release/recovery configuration, establish the relevant current state from application code and targeted read-only checks of live data/provider configuration. Distinguish verified current state from dated notes; do not assume an old plan describes what is live now.

Consult the [historical preparation handoff](.scratch/sponsorship/production-preparation/handoff.md) and [closed VAT collection decision](.scratch/sponsorship/production-preparation/vat-decision-20261021.md) for decision history, not current prices, resource IDs, environment values, metrics, or activation status. Do not replay old provisioning/launch steps or restore preparation defaults over the working site. Preserve closed business decisions unless the user changes them or new evidence requires review. Explain any proposed effect on live payments before applying it within the authorized scope.
