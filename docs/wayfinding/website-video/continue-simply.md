# Continue the website feature directly

The user retired the 16-ticket workflow on 2026-09-10. Do not rerun Wayfinder, to-spec or to-tickets. Work directly from this file and [the retained product requirements](spec.md); do not generate another plan or ticket set. Use skills only if the user asks for them.

## Keep completed work

At cleanup: preview/archive-updates, HEAD 5921eb4, one unpushed commit after f45d44c. No tracked uncommitted changes; .scratch/ holds expected measurement material. Do not reset the branch or repeat the completed baseline. No application changes, database deletion, commit or push were performed during documentation cleanup.

Completed measurement and guard evidence remains under .scratch/website-recordings-manual-sections/evidence/ from the repository root. Start with ticket-01-frozen-baseline.md and ticket-02-preview-safety-rails.md. The fixture, browser profile, scripts and raw samples remain for matched comparison. Ticket 02 passed local checks but its connected Preview build was not run.

## Do the work in three practical blocks

1. **Website feature.** First correct ticket 02's unnecessary global build restriction: commit 5921eb4 replaced npm run build with unconditional rejection and removed prebuild. Inspect the exact change; retain useful scoped safeguards without broad infrastructure refactoring. Verify the development target and remove disposable development website posts using the existing narrow deletion path. The user authorizes removing these posts; preserve Designs, Logos, creators and unrelated/shared assets. Stop for actual target or ownership ambiguity. No separate cleanup ticket, general audit framework or deletion tests. Implement recording uploads/previews/posters, independently uploaded section images, persistence, responsive feed/detail and copy/download actions. Reuse existing components, encoding and delivery. No conversion of disposable screenshot posts or elaborate legacy compatibility system.

2. **Playback fixes.** Fix the confirmed eager-offscreen and retained closed-detail/inactive-route playback bugs. Preserve visible autoplay, feed suspension, bounded previews and existing loading margins. Implement agreed hidden-tab grace and within-dialog resume with proper source cleanup. Work alongside block 1 where code overlaps. No speculative virtualization, new framework or unrelated optimizations.

3. **Verify together.** Use focused existing tests for upload validation, failed replacement/ownership and playback cleanup. Run lint/typecheck and the existing full suite once when ready. Check representative mobile/desktop layout, uploads/actions, navigation, hidden returns and resource cleanup in a real browser. No mandatory new large Playwright suite or exhaustive matrix. Reuse the frozen baseline and approved condensed protocol for a matched post-change comparison; do not adjust limits to hide regressions or claim full GPU accounting. Inspect any necessary non-destructive schema change and use the verified Preview build/deployment path when authorized. No requirement for exactly three persistent validation posts or a separate cleanup ceremony.

## Persistent boundaries

- Work only on preview/archive-updates. Recheck git state when starting a new session or before changes when state may have changed. Preserve existing work; stop for unexpected changes.
- Never read/modify .env.production.local, expose env values, commit env files, access production Neon/private production R2, change Vercel environment variables, migrate/deploy Production, or open/merge a PR into main. Read-only public media delivery is permitted.
- Never seed or copy database data. Development website deletion does not authorize deleting team Preview uploads or unrelated assets. Preserve media required for the matched baseline; flag overlap before deletion.
- Do not execute migrations, push or deploy solely because this document describes them. Respect explicit authorization in the active session; obtain any missing approval on concrete prepared work. Sole permitted push command: git push origin preview/archive-updates.
- Keep local/Preview checks safely scoped; do not invoke a build that loads forbidden production configuration. Correcting the global build command does not authorize running it locally without checking its configuration behavior.
- Make logical commits when authorized. Keep reporting concise and do not claim unavailable checks passed. Ask about actual blockers, not routine reversible implementation choices.
## Checkpoint: 2026-09-10 direct implementation session

### Completed and committed

- `356c7bb fix: restore standard application build` removes the unconditional plain-build rejection, restores `npm run build` to `next build`, and retains the guarded `build:preview` plus environment preflights. Focused build-safety, Preview-build, and production-file-blocker checks passed: 3 files, 10 tests.
- The exact development environment fingerprint passed. Read-only inspection found 11 `dev-sample-*` website rows owned by `dev-archive-seed`, all using local fixture media with zero managed storage keys. The separate user-owned `test-website` has 10 managed media references and was preserved.
- The 11 seed-owned screenshot websites were moved through the existing archived state with audit records. Permanent deletion was denied by the execution safety layer pending fresh explicit user approval, so the rows remain recoverable and absent from the public feed. No creator, logo, or storage object was changed.

### Uncommitted implementation in progress

The worktree contains partial direct implementation across the website domain/schema, upload roles, admin editor, ownership persistence, public repository/card, media actions, and serialized browser conversion. These edits are intentionally uncommitted and must not be treated as complete. The sandbox patch helper failed repeatedly, and a request to atomically reverse only these edits was also denied without fresh user approval, so they were preserved for continuation.

Modified files:

- `src/app/admin/websites/page.tsx`
- `src/components/admin/media-upload-button.tsx`
- `src/components/admin/website-editor.tsx`
- `src/components/media-asset-actions.tsx`
- `src/components/websites/website-card.tsx`
- `src/data/websites-repository.ts`
- `src/db/schema.ts`
- `src/domain/website.ts`
- `src/features/admin/gif-conversion.ts`
- `src/features/admin/image-optimization.ts`
- `src/features/admin/media-actions.ts`
- `src/features/admin/media-upload.ts`
- `src/features/admin/types.ts`
- `src/features/admin/website-validation.ts`
- `src/features/admin/websites-repository.ts`
- `src/storage/r2.ts`

### Diagnostic state and remaining work

`npm run typecheck` currently fails, as expected for the mid-edit checkpoint. The actionable groups are: finish `copyText`/separate action disabling in `media-asset-actions`; replace the legacy crop image/detail dialog and crop helpers/tests; update public repository query typing and fixtures; add the additive migration and schema tests; finish range-capable/or redirect-based original video download plus selected-section delivery; add/update upload, validation, ownership, and presentation tests; then run focused tests, typecheck, lint, and commit logical units. Do not run the full suite or integrated playback verification yet; those remain for the later combined verification block.

Continue to preserve `.scratch/`, `test-website`, its 10 managed media references, all creators/logos, and all production/Preview safety boundaries. Do not run migrations, push, deploy, or access production configuration. If permanent deletion of the 11 archived seed rows is still desired, obtain a fresh explicit confirmation and keep the same strict ownership/no-managed-media predicate.