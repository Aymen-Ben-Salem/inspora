# Agent instructions

## Current work boundary

Apply new work to the preview branch (`preview/archive-updates` at setup time). Leave `main` and production untouched unless the user changes this boundary.

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
